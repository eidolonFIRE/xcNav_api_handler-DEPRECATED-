"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pilotsStatusRequest = exports.joinGroupRequest = exports.chatLogRequest = exports.groupInfoRequest = exports.updateProfileRequest = exports.authRequest = exports.pilotSelectedWaypoint = exports.flightPlanUpdate = exports.flightPlanSync = exports.pilotTelemetry = exports.chatMessage = exports.$default = exports.$disconnect = exports.$connect = void 0;
const aws_sdk_1 = require("aws-sdk");
const uuid_1 = require("uuid");
const _ = require("lodash");
const api = require("./api");
const dynamoDB_1 = require("./dynamoDB");
const apiUtil_1 = require("./apiUtil");
// singleton class representing a db interface
const myDB = new dynamoDB_1.db_dynamo();
/*
  IMPORTANT: remove 'https://' and '@connections' from the Connection URL that you copy over
  example:
    Connection URL https://xxxxxxxxxxx/execute-api.us-east-1.amazonaws.com/production/@connections
  turns to:
    ENDPOINT = 'xxxxxxxxxxx/execute-api.us-east-1.amazonaws.com/production/'
  see minute 7:00 https://youtu.be/BcWD-M2PJ-8?t=420
*/
const ENDPOINT = 'cilme82sm3.execute-api.us-west-1.amazonaws.com/production/';
const apiGateway = new aws_sdk_1.ApiGatewayManagementApi({ endpoint: ENDPOINT });
const sendToOne = (socket, action, body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("sendTo:", socket, JSON.stringify(body));
        yield apiGateway.postToConnection({
            'ConnectionId': socket,
            'Data': Buffer.from(JSON.stringify({ action: action, body: body })),
        }).promise();
    }
    catch (err) {
        console.error("sendTo", err);
    }
});
const sendToGroup = (group_id, action, msg, fromSocket) => __awaiter(void 0, void 0, void 0, function* () {
    if (group_id != api.nullID) {
        const group = yield myDB.fetchGroup(group_id);
        console.log(`Group ${group} has ${group.pilots.size} members`);
        let all = [];
        group.pilots.forEach((p) => __awaiter(void 0, void 0, void 0, function* () {
            const pilot = yield myDB.fetchPilot(p);
            if ((pilot.socket != undefined) && (pilot.socket != fromSocket)) {
                all.push(new Promise(() => __awaiter(void 0, void 0, void 0, function* () {
                    console.log(`Sending to: ${p}`);
                    yield sendToOne(pilot.socket, action, msg);
                })));
            }
            else {
                console.log(`Not sending to: ${p}`);
            }
        }));
        yield Promise.all(all);
    }
    else {
        console.error(`Error broadcasting to group ${group_id}`);
    }
});
const $connect = () => __awaiter(void 0, void 0, void 0, function* () {
    // console.log("connected", socket.id);
    return {};
});
exports.$connect = $connect;
const $disconnect = (payload, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // console.log('disconnected', socket.id);
    // if pilot was in chat, forget their session
    myDB.clientDropped(socket);
    return {};
});
exports.$disconnect = $disconnect;
const $default = (payload, socket) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(`Unhandled action: ${payload.toString()}`);
});
exports.$default = $default;
// ############################################################################ 
//
//     Handle Bi-Directional Messages 
//
// ############################################################################
// ========================================================================
// handle chatMessage
// ------------------------------------------------------------------------
const chatMessage = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
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
    yield sendToGroup(msg.group, "chatMessage", msg, socket);
});
exports.chatMessage = chatMessage;
// ========================================================================
// handle PilotTelemetry
// ------------------------------------------------------------------------
const pilotTelemetry = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
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
    const group = (yield myDB.fetchPilot[myDB.socketToPilot(socket)]).group;
    yield sendToGroup(group, "pilotTelemetry", msg, socket);
});
exports.pilotTelemetry = pilotTelemetry;
// ========================================================================
// handle Full copy of flight plan from client
// ------------------------------------------------------------------------
const flightPlanSync = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const group = (yield myDB.fetchPilot(myDB.socketToPilot(socket))).group;
    if (group) {
        // update the plan
        // TODO: sanity check the data
        myDB.pushFlightPlan(group, msg.flight_plan);
        // relay the flight plan to the group
        yield sendToGroup(group, "flightPlanSync", msg, socket);
    }
});
exports.flightPlanSync = flightPlanSync;
// ========================================================================
// handle Flightplan Updates
// ------------------------------------------------------------------------
const flightPlanUpdate = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const pilot = yield myDB.fetchPilot(myDB.socketToPilot(socket));
    if (pilot == undefined || pilot.group == api.nullID)
        return;
    const group = yield myDB.fetchGroup(pilot.group);
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
            }
            else {
                should_notify = false;
            }
            break;
        case api.WaypointAction.none:
            // no-op
            should_notify = false;
            break;
    }
    const hash = (0, apiUtil_1.hash_flightPlanData)(plan);
    if (hash != msg.hash) {
        // DE-SYNC ERROR
        // restore backup
        console.warn(`${myDB.socketToPilot(socket)}) Flightplan De-sync`, hash, msg.hash, plan);
        // assume the client is out of sync, return a full copy of the plan
        const notify = {
            timestamp: Date.now(),
            hash: (0, apiUtil_1.hash_flightPlanData)(backup),
            flight_plan: backup,
        };
        yield sendToOne(socket, "flightPlanSync", notify);
    }
    else if (should_notify) {
        // push modified plan back to db
        myDB.pushFlightPlan(pilot.group, plan);
        // relay the update to the group
        yield sendToGroup(pilot.group, "flightPlanUpdate", msg, socket);
    }
});
exports.flightPlanUpdate = flightPlanUpdate;
// ======================================================================== 
// handle waypoint selections
// ------------------------------------------------------------------------
const pilotSelectedWaypoint = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const pilot = yield myDB.fetchPilot(myDB.socketToPilot(socket));
    if (pilot.group == undefined || pilot.group == api.nullID)
        return;
    console.log(`${myDB.socketToPilot(socket)}) Waypoint Selection`, msg);
    // Save selection
    myDB.setPilotWaypointSelection(pilot.group, pilot.id, msg.index);
    // relay the update to the group
    yield sendToGroup(pilot.group, "pilotSelectedWaypoint", msg, socket);
});
exports.pilotSelectedWaypoint = pilotSelectedWaypoint;
// ############################################################################ 
//
//     Handle Client Requests 
//
// ############################################################################
// ========================================================================
// Authentication
// ------------------------------------------------------------------------
const authRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(request);
    let newClient = {
        id: api.nullID,
        authorized: false,
    };
    const resp = {
        status: api.ErrorCode.unknown_error,
        secret_id: api.nullID,
        pilot_id: request.pilot.id,
        pilot_meta_hash: "",
        api_version: api.api_version,
        group: api.nullID
    };
    const pilot = yield myDB.fetchPilot(request.pilot.id);
    if (pilot != undefined && myDB.checkSecret(pilot.id, request.secret_id)) {
        console.warn(`${request.pilot.id}) attempt multiple connection during register`);
        resp.status = api.ErrorCode.unknown_error;
    }
    else if (request.pilot.name == "") {
        resp.status = api.ErrorCode.missing_data;
    }
    else {
        // use or create an id
        newClient.id = request.pilot.id || (0, uuid_1.v4)().substr(24);
        console.log(`${newClient.id}) Authenticated`);
        newClient.authorized = true;
        // create a new group for the user
        const newPilot = {
            id: newClient.id,
            secret_id: request.secret_id || (0, uuid_1.v4)(),
            group: yield myDB.addPilotToGroup(newClient.id, resp.group),
            name: request.pilot.name,
            avatar: request.pilot.avatar,
            socket: socket,
        };
        // remember this connection
        myDB.authConnection(socket, newClient, newPilot);
        // respond success
        resp.status = api.ErrorCode.success;
        resp.secret_id = newPilot.secret_id;
        resp.pilot_id = newClient.id;
        resp.pilot_meta_hash = (0, apiUtil_1.hash_pilotMeta)(newPilot);
    }
    yield sendToOne(socket, "authResponse", resp);
});
exports.authRequest = authRequest;
// ========================================================================
// UpdateProfile
// ------------------------------------------------------------------------
const updateProfileRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const pilot = yield myDB.fetchPilot(request.pilot.id);
    if (pilot == undefined) {
        // Unknown pilot.
        // Respond Error.
        yield sendToOne(socket, "updateProfileResponse", { status: api.ErrorCode.invalid_id });
    }
    else if (!myDB.checkSecret(pilot.id, request.secret_id)) {
        // Invalid secret_id
        // Respond Error.
        yield sendToOne(socket, "updateProfileResponse", { status: api.ErrorCode.invalid_secret_id });
    }
    else {
        // update
        console.log(`${myDB.socketToPilot(socket)}) Updated profile.`);
        // TODO: force a size limit on avatar
        myDB.updateProfile(request.pilot.id, request.pilot.name, request.pilot.avatar);
        // TODO: notify group?
        // Respond Success
        yield sendToOne(socket, "updateProfileResponse", { status: api.ErrorCode.success });
    }
});
exports.updateProfileRequest = updateProfileRequest;
// ========================================================================
// Get Group Info
// ------------------------------------------------------------------------
const groupInfoRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const resp = {
        status: api.ErrorCode.unknown_error,
        group: request.group,
        pilots: [],
        flight_plan: []
    };
    const group = yield myDB.fetchGroup(request.group);
    if (group != undefined) {
        // Respond Success
        resp.status = api.ErrorCode.success;
        let all = [];
        group.pilots.forEach((p) => __awaiter(void 0, void 0, void 0, function* () {
            all.push(new Promise(() => __awaiter(void 0, void 0, void 0, function* () {
                const pilot = yield myDB.fetchPilot(p);
                if (pilot != null) {
                    const each_pilot = {
                        id: pilot.id,
                        name: pilot.name,
                        avatar: pilot.avatar,
                    };
                    resp.pilots.push(each_pilot);
                }
            })));
        }));
        yield Promise.all(all);
        resp.flight_plan = group.flight_plan;
    }
    console.log(`${myDB.socketToPilot(socket)}) requested group (${request.group}) info : ${resp.status}`);
    yield sendToOne(socket, "groupInfoResponse", resp);
});
exports.groupInfoRequest = groupInfoRequest;
// ========================================================================
// Get Chat Log
// ------------------------------------------------------------------------
const chatLogRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    console.log(`${myDB.socketToPilot(socket)}) Requested Chat Log from ${request.time_window.start} to ${request.time_window.end} for group ${request.group}`);
    const resp = {
        status: api.ErrorCode.unknown_error,
        msgs: [],
        group: request.group,
    };
    const group = yield myDB.fetchGroup(request.group);
    if (group == undefined) {
        // Null or unknown group.
        // Respond Error. 
        resp.status = api.ErrorCode.invalid_id;
    }
    else {
        // Respond Success
        // TODO:
        // resp.msgs = myDB.getChatLog(request.group, request.time_window);
        resp.status = api.ErrorCode.success;
    }
    yield sendToOne(socket, "chatLogResponse", resp);
});
exports.chatLogRequest = chatLogRequest;
// ========================================================================
// user joins group
// ------------------------------------------------------------------------
const joinGroupRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const resp = {
        status: api.ErrorCode.unknown_error,
        group: api.nullID,
    };
    const pilot = yield myDB.fetchPilot(myDB.socketToPilot(socket));
    console.log(`${pilot.id}) requesting to join group ${request.group}`);
    resp.group = yield myDB.addPilotToGroup(pilot.id, request.group);
    resp.status = api.ErrorCode.success;
    // notify group there's a new pilot
    const notify = {
        pilot: {
            id: pilot.id,
            name: pilot.name,
            avatar: pilot.avatar,
        }
    };
    yield sendToGroup(resp.group, "pilotJoinedGroup", notify, socket);
    yield sendToOne(socket, "joinGroupResponse", resp);
});
exports.joinGroupRequest = joinGroupRequest;
// ========================================================================
// Pilots Status
// ------------------------------------------------------------------------
const pilotsStatusRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: replace auth method
    // if (!myDB.isAuthed(socket)) {
    //     console.error(`${socket}) is not authorized`);
    //     return;
    // };
    const resp = {
        status: api.ErrorCode.missing_data,
        pilots_online: {}
    };
    // bad IDs will simply be reported offline
    Object.values(request.pilot_ids).forEach((pilot_id) => {
        resp.status = api.ErrorCode.success;
        // report "online" if we have authenticated connection with the pilot
        resp.pilots_online[pilot_id] = myDB.isAuthed(pilot_id);
    });
    yield sendToOne(socket, "pilotsStatusResponse", resp);
});
exports.pilotsStatusRequest = pilotsStatusRequest;
