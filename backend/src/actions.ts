import { ApiGatewayManagementApi } from 'aws-sdk';
import { v4 as uuidv4 } from "uuid";
import * as _ from "lodash";

import * as api from "./api";
import { myDB, Client } from "./db";
import { hash_flightPlanData, hash_pilotMeta } from "./apiUtil";









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

const sendToOne = async (socket: string, body: any) => {
    try {
        console.log("sendTo:", socket, JSON.stringify(body));
        await apiGateway.postToConnection({
            'ConnectionId': socket,
            'Data': Buffer.from(JSON.stringify(body)),
        }).promise();
    } catch (err) {
        console.error("sendTo", err);
    }
};

const sendToGroup = async (group_id: api.ID, action: string,  msg: any, fromSocket: string) => {
    if (group_id != api.nullID && myDB.hasGroup(group_id)) {
        console.log(`Group ${group_id} has ${myDB.groups[group_id].pilots.size} members`);
        // await Promise.all(Object.keys(myDB.groups[group_id].pilots).map(async (p) => {
        //     if (myDB.hasSocket(p) && myDB.findSocket(p) != fromSocket) {
        //         console.log(`Sending to: ${p}`);
        //         await sendToOne(myDB.findSocket(p), {action: action, body: msg});
        //     } else {
        //         console.log(`Not sending to: ${p}`);
        //     }
        // }));
        let all: Promise<void>[] = [];
        myDB.groups[group_id].pilots.forEach(async (p) => {
            if (myDB.hasSocket(p) && myDB.findSocket(p) != fromSocket) {
                all.push(new Promise(async () => {
                
                    console.log(`Sending to: ${p}`);
                    await sendToOne(myDB.findSocket(p), {action: action, body: msg});
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
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };

    // fill in who message came from
    msg.pilot_id = myDB.socketToPilot(socket);
    
    console.log(`${myDB.socketToPilot(socket)}) Msg:`, msg);
    
    // if no group or invalid group, ignore message
    // TODO: also check pilot is actually in that group
    if (msg.group_id == api.nullID || !myDB.hasGroup(msg.group_id)) {
        console.log("Msg was dropped.");
        return;
    }

    // record message into log
    myDB.recordChat(msg);

    // broadcast message to group
    await sendToGroup(msg.group_id, "chatMessage", msg, socket);
};

// ========================================================================
// handle PilotTelemetry
// ------------------------------------------------------------------------
export const pilotTelemetry = async (msg: api.PilotTelemetry, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };

    // TODO: Replace with better check
    // if (!myDB.hasPilot(msg.pilot_id)) return;
    msg.pilot_id = myDB.socketToPilot(socket);

    // record the location
    // TODO: disable this for now
    // myDB.recordPilotTelemetry(msg);

    // if in group, broadcast location
    // TODO: only broadcast if it's recent location update?
    const group_id = myDB.pilots[myDB.socketToPilot(socket)].group_id;
    await sendToGroup(group_id, "pilotTelemetry", msg, socket);
};

// ========================================================================
// handle Full copy of flight plan from client
// ------------------------------------------------------------------------
export const flightPlanSync = async (msg: api.FlightPlanSync, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
    const group_id = myDB.pilots[myDB.socketToPilot(socket)].group_id;
    if (group_id == api.nullID) return;

    // update the plan
    myDB.groups[group_id].flight_plan = msg.flight_plan;
    // TODO: check the hash necessary here?

    // relay the flight plan to the group
    await sendToGroup(group_id, "flightPlanSync", msg, socket);
};

// ========================================================================
// handle Flightplan Updates
// ------------------------------------------------------------------------
export const flightPlanUpdate = async (msg: api.FlightPlanUpdate, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
    const group_id = myDB.pilots[myDB.socketToPilot(socket)].group_id;
    if (group_id == api.nullID) return;

    console.log(`${myDB.socketToPilot(socket)}) Waypoint Update`, msg);

    // make backup copy of the plan
    const plan = myDB.groups[group_id].flight_plan;
    const backup = _.cloneDeep(plan);

    let should_notify = true;

    // update the plan
    switch (msg.action) {
        case api.WaypointAction.delete:
            // Delete a waypoint
            // TODO: verify wp
            plan.waypoints.splice(msg.index, 1);
            break;
        case api.WaypointAction.new:
            // insert a new waypoint
            plan.waypoints.splice(msg.index, 0, msg.data);

            break;
        case api.WaypointAction.sort:
            // Reorder a waypoint
            const wp = plan.waypoints[msg.index];
            plan.waypoints.splice(msg.index, 1);
            plan.waypoints.splice(msg.new_index, 0, wp);
            break;
        case api.WaypointAction.modify:
            // Make updates to a waypoint
            if (msg.data != null) {
                plan.waypoints[msg.index] = msg.data;
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
        myDB.groups[group_id].flight_plan = backup;

        // assume the client is out of sync, return a full copy of the plan
        const notify: api.FlightPlanSync = {
            timestamp: Date.now(),
            hash: hash_flightPlanData(backup),
            flight_plan: backup,
        }
        await sendToOne(socket, {action: "flightPlanSync", body: notify});
    } else if (should_notify) {
        // relay the update to the group
        await sendToGroup(group_id, "flightPlanUpdate", msg, socket);
    }
};

// ======================================================================== 
// handle waypoint selections
// ------------------------------------------------------------------------
export const pilotWaypointSelections = async (msg: api.PilotWaypointSelections, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
    const group_id = myDB.pilots[myDB.socketToPilot(socket)].group_id;
    if (group_id == api.nullID) return;

    console.log(`${myDB.socketToPilot(socket)}) Waypoint Selection`, msg);

    // Save selection
    Object.entries(msg).forEach(([pilot_id, wp_index]) => {
        myDB.groups[group_id].wp_selections[pilot_id] = wp_index;
    });

    // relay the update to the group
    await sendToGroup(group_id, "pilotWaypointSelections", msg, socket);
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
        secret_id: api.nullID,
        authentic: false,
    };

    const resp: api.AuthResponse = {
        status: api.ErrorCode.unknown_error,
        secret_id: api.nullID,
        pilot_id: request.pilot.id,
        pilot_meta_hash: "",
        api_version: api.api_version,
        group_id: api.nullID
    };

    if (myDB.hasSocket(request.pilot.id) && !myDB.checkSecret(socket, request.secret_id)) {
        console.warn(`${request.pilot.id}) attempt multiple connection during register`);
        resp.status = api.ErrorCode.unknown_error;
    } else if (request.pilot.name == "") {
        resp.status = api.ErrorCode.missing_data;
    } else {
        // use or create an id
        newClient.secret_id = request.secret_id || uuidv4();
        newClient.id = request.pilot.id || uuidv4().substr(24);
        console.log(`${newClient.id}) Authenticated`);
        newClient.authentic = true;

        // update db
        myDB.newPilot(request.pilot.name, newClient.id, newClient.secret_id, request.pilot.avatar);

        // respond success
        resp.status = api.ErrorCode.success;
        resp.secret_id = newClient.secret_id;
        resp.pilot_id = newClient.id;
        resp.pilot_meta_hash = hash_pilotMeta(myDB.pilots[newClient.id]);

        // remember this connection
        myDB.newConnection(newClient, socket);

        // create a new group for the user
        const old_group = myDB.findGroup(newClient.id);
        if (old_group != api.nullID) {
            console.log(`${newClient.id}) Rejoining group ${old_group}`);
            resp.group_id = old_group;
        } else {
            resp.group_id = myDB.newGroup();
            myDB.addPilotToGroup(newClient.id, resp.group_id);
        }
    }
    await sendToOne(socket, {action: "authResponse", body: resp});
};


// ========================================================================
// UpdateProfile
// ------------------------------------------------------------------------
export const updateProfileRequest = async (request: api.UpdateProfileRequest, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };

    // check IDs
    if (!myDB.hasPilot(request.pilot.id)) {
        // Unknown pilot.
        // Respond Error.
        await sendToOne(socket, {action: "updateProfileResponse", body: {status: api.ErrorCode.invalid_id}});
    } else if (!myDB.checkSecret(socket, request.secret_id)) {
        // Invalid secret_id
        // Respond Error.
        await sendToOne(socket, {action: "updateProfileResponse", body: {status: api.ErrorCode.invalid_secret_id}});
    } else {
        // update
        console.log(`${myDB.socketToPilot(socket)}) Updated profile.`);
        // TODO: force a size limit on avatar
        myDB.updateProfile(request.pilot.id, request.pilot.name, request.pilot.avatar);

        // TODO: notify group?

        // Respond Success
        await sendToOne(socket, {action: "updateProfileResponse", body: {status: api.ErrorCode.success}});
    }
};


// ========================================================================
// Get Group Info
// ------------------------------------------------------------------------
export const groupInfoRequest = async (request: api.GroupInfoRequest, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
    const resp: api.GroupInfoResponse = {
        status: api.ErrorCode.unknown_error,
        group_id: request.group_id,
        map_layers: [],
        pilots: [],
        flight_plan: null
    };

    if (request.group_id == api.nullID || !myDB.hasGroup(request.group_id)) {
        // Null or unknown group_id.
        // Respond Error. 
        resp.status = api.ErrorCode.invalid_id;
    } else if (request.group_id != myDB.pilots[myDB.socketToPilot(socket)].group_id) {
        // Pilot not in this group.
        // Respond Error. 
        resp.status = api.ErrorCode.denied_group_access;
    } else {
        // Respond Success
        resp.status = api.ErrorCode.success;
        resp.map_layers = myDB.groups[request.group_id].map_layers;
        myDB.groups[request.group_id].pilots.forEach((p: api.ID) => {
            const each_pilot: api.PilotMeta = {
                id: p,
                name: myDB.pilots[p].name,
                avatar: myDB.pilots[p].avatar,
            }
            resp.pilots.push(each_pilot);
        });
        resp.flight_plan = myDB.groups[request.group_id].flight_plan;
    }
    console.log(`${myDB.socketToPilot(socket)}) requested group (${request.group_id}) info : ${resp.status}`);
    await sendToOne(socket, {action: "groupInfoResponse", body: resp});
};


// ========================================================================
// Get Chat Log
// ------------------------------------------------------------------------
export const chatLogRequest = async (request: api.ChatLogRequest, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };

    console.log(`${myDB.socketToPilot(socket)}) Requested Chat Log from ${request.time_window.start} to ${request.time_window.end} for group_id ${request.group_id}`);

    const resp: api.ChatLogResponse = {
        status: api.ErrorCode.unknown_error,
        msgs: [],
        group_id: request.group_id,
    };

    if (request.group_id == api.nullID || !myDB.hasGroup(request.group_id)) {
        // Null or unknown group_id.
        // Respond Error. 
        resp.status = api.ErrorCode.invalid_id;
    } else if (request.group_id != myDB.pilots[myDB.socketToPilot(socket)].group_id) {
        // Pilot not in this group.
        // Respond Error. 
        resp.status = api.ErrorCode.denied_group_access;
    } else {
        // Respond Success
        resp.msgs = myDB.getChatLog(request.group_id, request.time_window);
        resp.status = api.ErrorCode.success
    }        
    await sendToOne(socket, {action: "chatLogResponse", body: resp});
};


// ========================================================================
// user joins group
// ------------------------------------------------------------------------
export const joinGroupRequest = async (request: api.JoinGroupRequest, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
    const resp: api.JoinGroupResponse = {
        status: api.ErrorCode.unknown_error,
        group_id: api.nullID,
    };

    console.log(`${myDB.socketToPilot(socket)}) requesting to join group ${request.group_id}`)

    if (myDB.hasGroup(request.group_id)) {
        // join a group
        if (request.group_id == myDB.pilots[myDB.socketToPilot(socket)].group_id) {
            // already in this group
            resp.status = api.ErrorCode.no_op;
        } else {
            resp.status = api.ErrorCode.success;
        }
        resp.group_id = request.group_id;
        // TODO: joining directly on pilot is no longer supported.
    // } else if (myDB.hasPilot(request.group_id) && myDB.hasClient(request.group_id)) {
    //     // join on a pilot
    //     resp.status = api.ErrorCode.success;
    //     resp.group_id = myDB.pilots[request.group_id].group_id;

    //     if (resp.group_id == api.nullID) {
    //         // need to make a new group
    //         resp.group_id = myDB.newGroup();
    //         console.log(`${myDB.socketToPilot(socket)}) Form new group ${resp.group_id} on ${request.group_id}`);
    //         myDB.addPilotToGroup(request.group_id, resp.group_id);

    //         // notify the pilot they are in a group now
    //         // TODO: we should have a dedicated message for this (don't overload the JoinGroupResponse like this)
    //         const notify = {
    //             status: api.ErrorCode.success,
    //             group_id: resp.group_id,
    //         } as api.JoinGroupResponse;
    //         clients[request.group_id].sendToOne(socket, {action: "joinGroupResponse", body: notify});
    //     }
    } else if (request.group_id != null && request.group_id != api.nullID) {
        // make the requested group
        resp.status = api.ErrorCode.success;
        resp.group_id = myDB.newGroup(request.group_id);
    } else {
        // bad group request. Can't make a new group with this id.
        resp.status = api.ErrorCode.invalid_id;
    }

    // If ID match, join the group
    if (resp.group_id != api.nullID) {
        // check if pilot was already in a group
        const prev_group = myDB.findGroup(myDB.socketToPilot(socket));
        if (prev_group != api.nullID) {
            // notify the old group
            const notify = {
                pilot_id: myDB.socketToPilot(socket),
                // TODO: populate if split is prompted
                new_group_id: api.nullID,
            } as api.PilotLeftGroup;
            await sendToGroup(prev_group, "pilotLeftGroup", notify, socket);
            myDB.removePilotFromGroup(myDB.socketToPilot(socket));
        }

        // add pilot to group
        myDB.addPilotToGroup(myDB.socketToPilot(socket), resp.group_id);
        
        // notify group there's a new pilot
        const notify: api.PilotJoinedGroup = {
            pilot: {
                id: myDB.socketToPilot(socket),
                name: myDB.pilots[myDB.socketToPilot(socket)].name,
                avatar: myDB.pilots[myDB.socketToPilot(socket)].avatar,
            }
        };
        await sendToGroup(resp.group_id, "pilotJoinedGroup", notify, socket);
    }

    await sendToOne(socket, {action: "joinGroupResponse", body: resp});
};

// ========================================================================
// Leave Group
// ------------------------------------------------------------------------
export const leaveGroupRequest = async (request: api.LeaveGroupRequest, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
    const resp: api.LeaveGroupResponse = {
        status: api.ErrorCode.unknown_error,
        group_id: api.nullID,
    };

    if (myDB.pilots[myDB.socketToPilot(socket)].group_id != api.nullID) {
        resp.status = api.ErrorCode.success;
        const notify = {
            pilot_id: myDB.socketToPilot(socket),
            new_group_id: api.nullID,
        } as api.PilotLeftGroup;
        const prev_group = myDB.pilots[myDB.socketToPilot(socket)].group_id;
        // Leave the group
        myDB.removePilotFromGroup(myDB.socketToPilot(socket))

        resp.group_id = myDB.newGroup();
        myDB.addPilotToGroup(myDB.socketToPilot(socket), resp.group_id);

        if (request.prompt_split) {
            // will let others know what new group pilot is joining
            notify.new_group_id = resp.group_id;
        }

        // notify the group
        await sendToGroup(prev_group, "pilotLeftGroup", notify, socket);
    } else {
        // Pilot isn't currently in a group.
        // Return Error
        resp.status = api.ErrorCode.no_op;
    }
    await sendToOne(socket, {action: "leaveGroupResponse", body: resp});
};

// ========================================================================
// Pilots Status
// ------------------------------------------------------------------------
export const pilotsStatusRequest = async (request: api.PilotsStatusRequest, socket: string) => {
    if (!myDB.isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    };
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
    await sendToOne(socket, {action: "pilotsStatusResponse", body: resp});
};

