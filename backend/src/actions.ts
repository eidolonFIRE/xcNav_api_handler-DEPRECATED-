import { ApiGatewayManagementApi } from 'aws-sdk';
import { v4 as uuidv4 } from "uuid";
import * as _ from "lodash";

import * as api from "./api";
import { db_dynamo, Client, Pilot } from "./dynamoDB";
import { hash_flightPlanData, hash_pilotMeta } from "./apiUtil";




// singleton class representing a db interface
const myDB = new db_dynamo();





/*
  IMPORTANT: remove 'https://' and '@connections' from the Connection URL that you copy over
  example:
    Connection URL https://xxxxxxxxxxx/execute-api.us-east-1.amazonaws.com/production/@connections
  turns to:
    ENDPOINT = 'xxxxxxxxxxx/execute-api.us-east-1.amazonaws.com/production/'
  see minute 7:00 https://youtu.be/BcWD-M2PJ-8?t=420
*/
const ENDPOINT = 'cilme82sm3.execute-api.us-west-1.amazonaws.com/production/';
const apiGateway = new ApiGatewayManagementApi({ endpoint: ENDPOINT });

const sendToOne = async (socket: string, action: string, body: any) => {
    try {
        console.log("sendTo:", socket, JSON.stringify(body));
        await apiGateway.postToConnection({
            'ConnectionId': socket,
            'Data': Buffer.from(JSON.stringify({action: action, body: body})),
        }).promise();
    } catch (err) {
        console.error("sendTo", err);
    }
};

const sendToGroup = async (group_id: api.ID, action: string,  msg: any, fromSocket: string) => {
    if (group_id != api.nullID) {
        const group = await myDB.fetchGroup(group_id);
        console.log(`Group ${group} has ${group.pilots.size} members`);

        let all: Promise<void>[] = [];
        group.pilots.forEach(async (p) => {
            const pilot = await myDB.fetchPilot(p);
            if ((pilot.socket != undefined) && (pilot.socket != fromSocket)) {
                all.push(new Promise(async () => {
                
                    console.log(`Sending to: ${p}`);
                    await sendToOne(pilot.socket, action, msg);
                }));
            } else {
                console.log(`Not sending to: ${p}`);
            }
        });
        await Promise.all(all);
    } else {
        console.error(`Error broadcasting to group ${group_id}`);
    }
};

export const $connect = async () => {
    // console.log("connected", socket.id);
    return {};
};


export const $disconnect = async (payload, socket: string) => {
    // console.log('disconnected', socket.id);
    // if pilot was in chat, forget their session
    myDB.clientDropped(socket);
    return {};
};


export const $default = async (payload, socket: string) => {
    console.error(`Unhandled action: ${payload.toString()}`);
}



// ############################################################################ 
//
//     Handle Bi-Directional Messages 
//
// ############################################################################

// ========================================================================
// handle chatMessage
// ------------------------------------------------------------------------
export const chatMessage = async (msg: api.ChatMessage, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };

    // fill in who message came from
    msg.pilot_id = myDB.socketToPilot(socket);
    console.log(`${msg.pilot_id}) Msg:`, msg);
    
    // if no group or invalid group, ignore message
    // TODO: also check pilot is actually in that group
    if (msg.pilot_id == undefined) {
        console.error("Error, we don't know who this socket belongs to!");
        return;
    }

    // record message into log
    // TODO
    // myDB.recordChat(msg);

    // broadcast message to group
    await sendToGroup(msg.group, "chatMessage", msg, socket);
};

// ========================================================================
// handle PilotTelemetry
// ------------------------------------------------------------------------
export const pilotTelemetry = async (msg: api.PilotTelemetry, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };

    msg.pilot_id = myDB.socketToPilot(socket);

    // record the location
    // TODO: disable this for now
    // myDB.recordPilotTelemetry(msg);

    // if in group, broadcast location
    // TODO: only broadcast if it's recent location update?
    const group = (await myDB.fetchPilot[myDB.socketToPilot(socket)]).group;
    await sendToGroup(group, "pilotTelemetry", msg, socket);
};

// ========================================================================
// handle Full copy of flight plan from client
// ------------------------------------------------------------------------
export const flightPlanSync = async (msg: api.FlightPlanSync, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const group = (await myDB.fetchPilot(myDB.socketToPilot(socket))).group;
    if (group) {
        // update the plan
        // TODO: sanity check the data
        myDB.pushFlightPlan(group, msg.flight_plan);

        // relay the flight plan to the group
        await sendToGroup(group, "flightPlanSync", msg, socket);
    }
};

// ========================================================================
// handle Flightplan Updates
// ------------------------------------------------------------------------
export const flightPlanUpdate = async (msg: api.FlightPlanUpdate, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const pilot = await myDB.fetchPilot(myDB.socketToPilot(socket));
    if (pilot == undefined || pilot.group == api.nullID) return;
    const group = await myDB.fetchGroup(pilot.group);

    console.log(`${myDB.socketToPilot(socket)}) Waypoint Update`, msg);

    // make backup copy of the plan
    const plan = group.flight_plan;
    const backup = _.cloneDeep(plan);

    let should_notify = true;

    // update the plan
    switch (msg.action) {
        case api.WaypointAction.delete:
            // Delete a waypoint
            // TODO: verify wp
            plan.splice(msg.index, 1);
            break;
        case api.WaypointAction.new:
            // insert a new waypoint
            plan.splice(msg.index, 0, msg.data);

            break;
        case api.WaypointAction.sort:
            // Reorder a waypoint
            const wp = plan[msg.index];
            plan.splice(msg.index, 1);
            plan.splice(msg.new_index, 0, wp);
            break;
        case api.WaypointAction.modify:
            // Make updates to a waypoint
            if (msg.data != null) {
                plan[msg.index] = msg.data;
            } else {
                should_notify = false;
            }
            break;
        case api.WaypointAction.none:
            // no-op
            should_notify = false;
            break;
    }

    const hash = hash_flightPlanData(plan);
    if (hash != msg.hash) {
        // DE-SYNC ERROR
        // restore backup
        console.warn(`${myDB.socketToPilot(socket)}) Flightplan De-sync`, hash, msg.hash, plan);

        // assume the client is out of sync, return a full copy of the plan
        const notify: api.FlightPlanSync = {
            timestamp: Date.now(),
            hash: hash_flightPlanData(backup),
            flight_plan: backup,
        }
        await sendToOne(socket, "flightPlanSync", notify);
    } else if (should_notify) {
        // push modified plan back to db
        myDB.pushFlightPlan(pilot.group, plan);

        // relay the update to the group
        await sendToGroup(pilot.group, "flightPlanUpdate", msg, socket);
    }
};

// ======================================================================== 
// handle waypoint selections
// ------------------------------------------------------------------------
export const pilotSelectedWaypoint = async (msg: api.PilotSelectedWaypoint, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const pilot = await myDB.fetchPilot(myDB.socketToPilot(socket));
    if (pilot.group == undefined || pilot.group == api.nullID) return;

    console.log(`${myDB.socketToPilot(socket)}) Waypoint Selection`, msg);

    // Save selection
    myDB.setPilotWaypointSelection(pilot.group, pilot.id, msg.index);

    // relay the update to the group
    await sendToGroup(pilot.group, "pilotSelectedWaypoint", msg, socket);
};



// ############################################################################ 
//
//     Handle Client Requests 
//
// ############################################################################


// ========================================================================
// Authentication
// ------------------------------------------------------------------------
export const authRequest = async (request: api.AuthRequest, socket: string) => {
    console.log(request);
    let newClient: Client = {
        id: api.nullID,
        authorized: false,
    };

    const resp: api.AuthResponse = {
        status: api.ErrorCode.unknown_error,
        secret_id: api.nullID,
        pilot_id: request.pilot.id,
        pilot_meta_hash: "",
        api_version: api.api_version,
        group: api.nullID
    };

    const pilot = await myDB.fetchPilot(request.pilot.id);
    if (pilot != undefined && myDB.checkSecret(pilot.id, request.secret_id)) {
        console.warn(`${request.pilot.id}) attempt multiple connection during register`);
        resp.status = api.ErrorCode.unknown_error;
    } else if (request.pilot.name == "") {
        resp.status = api.ErrorCode.missing_data;
    } else {
        // use or create an id
        newClient.id = request.pilot.id || uuidv4().substr(24);
        console.log(`${newClient.id}) Authenticated`);
        newClient.authorized = true;

        // create a new group for the user
        const newPilot: Pilot = {
            id: newClient.id,
            secret_id: request.secret_id || uuidv4(),
            group: await myDB.addPilotToGroup(newClient.id, resp.group),
            name: request.pilot.name,
            avatar: request.pilot.avatar,
            socket: socket,
        }

        // remember this connection
        myDB.authConnection(
            socket, 
            newClient,
            newPilot);

        // respond success
        resp.status = api.ErrorCode.success;
        resp.secret_id = newPilot.secret_id;
        resp.pilot_id = newClient.id;
        resp.pilot_meta_hash = hash_pilotMeta(newPilot);        


    }
    await sendToOne(socket, "authResponse", resp);
};


// ========================================================================
// UpdateProfile
// ------------------------------------------------------------------------
export const updateProfileRequest = async (request: api.UpdateProfileRequest, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };

    const pilot = await myDB.fetchPilot(request.pilot.id);
    if (pilot == undefined) {
        // Unknown pilot.
        // Respond Error.
        await sendToOne(socket, "updateProfileResponse", {status: api.ErrorCode.invalid_id});
    } else if (!myDB.checkSecret(pilot.id, request.secret_id)) {
        // Invalid secret_id
        // Respond Error.
        await sendToOne(socket, "updateProfileResponse", {status: api.ErrorCode.invalid_secret_id});
    } else {
        // update
        console.log(`${myDB.socketToPilot(socket)}) Updated profile.`);
        // TODO: force a size limit on avatar
        myDB.updateProfile(request.pilot.id, request.pilot.name, request.pilot.avatar);

        // TODO: notify group?

        // Respond Success
        await sendToOne(socket, "updateProfileResponse", {status: api.ErrorCode.success});
    }
};


// ========================================================================
// Get Group Info
// ------------------------------------------------------------------------
export const groupInfoRequest = async (request: api.GroupInfoRequest, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const resp: api.GroupInfoResponse = {
        status: api.ErrorCode.unknown_error,
        group: request.group,
        pilots: [],
        flight_plan: []
    };

    const group = await myDB.fetchGroup(request.group);
    if (group != undefined) {
        // Respond Success
        resp.status = api.ErrorCode.success;
        let all: Promise<void>[] = [];
        group.pilots.forEach(async (p: api.ID) => {
            all.push(new Promise(async () => {
                const pilot = await myDB.fetchPilot(p);
                if (pilot != null) {
                    const each_pilot: api.PilotMeta = {
                        id: pilot.id,
                        name: pilot.name,
                        avatar: pilot.avatar,
                    }
                    resp.pilots.push(each_pilot);
                }
            }));
        });
        await Promise.all(all);
        resp.flight_plan = group.flight_plan;
    }
    console.log(`${myDB.socketToPilot(socket)}) requested group (${request.group}) info : ${resp.status}`);
    await sendToOne(socket, "groupInfoResponse", resp);
};


// ========================================================================
// Get Chat Log
// ------------------------------------------------------------------------
export const chatLogRequest = async (request: api.ChatLogRequest, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };

    console.log(`${myDB.socketToPilot(socket)}) Requested Chat Log from ${request.time_window.start} to ${request.time_window.end} for group ${request.group}`);

    const resp: api.ChatLogResponse = {
        status: api.ErrorCode.unknown_error,
        msgs: [],
        group: request.group,
    };

    const group = await myDB.fetchGroup(request.group);
    if (group == undefined) {
        // Null or unknown group.
        // Respond Error. 
        resp.status = api.ErrorCode.invalid_id;
    } else {
        // Respond Success
        // TODO:
        // resp.msgs = myDB.getChatLog(request.group, request.time_window);
        resp.status = api.ErrorCode.success
    }        
    await sendToOne(socket, "chatLogResponse", resp);
};


// ========================================================================
// user joins group
// ------------------------------------------------------------------------
export const joinGroupRequest = async (request: api.JoinGroupRequest, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const resp: api.JoinGroupResponse = {
        status: api.ErrorCode.unknown_error,
        group: api.nullID,
    };

    const pilot = await myDB.fetchPilot(myDB.socketToPilot(socket));

    console.log(`${pilot.id}) requesting to join group ${request.group}`)

    resp.group = await myDB.addPilotToGroup(pilot.id, request.group);
    resp.status = api.ErrorCode.success;

    // notify group there's a new pilot
    const notify: api.PilotJoinedGroup = {
        pilot: {
            id: pilot.id,
            name: pilot.name,
            avatar: pilot.avatar,
        }
    };
    await sendToGroup(resp.group, "pilotJoinedGroup", notify, socket);
    await sendToOne(socket, "joinGroupResponse", resp);
};


// ========================================================================
// Pilots Status
// ------------------------------------------------------------------------
export const pilotsStatusRequest = async (request: api.PilotsStatusRequest, socket: string) => {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const resp: api.PilotsStatusResponse = {
        status: api.ErrorCode.missing_data,
        pilots_online: {}
    };

    // bad IDs will simply be reported offline
    Object.values(request.pilot_ids).forEach((pilot_id: api.ID) => {
        resp.status = api.ErrorCode.success;
        // report "online" if we have authenticated connection with the pilot
        resp.pilots_online[pilot_id] = myDB.isAuthed(pilot_id);
    });
    await sendToOne(socket, "pilotsStatusResponse", resp);
};

