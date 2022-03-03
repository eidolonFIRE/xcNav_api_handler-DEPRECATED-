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
exports.pilotsStatusRequest = exports.leaveGroupRequest = exports.joinGroupRequest = exports.chatLogRequest = exports.groupInfoRequest = exports.updateProfileRequest = exports.authRequest = exports.pilotWaypointSelections = exports.flightPlanUpdate = exports.flightPlanSync = exports.pilotTelemetry = exports.chatMessage = exports.$default = exports.$disconnect = exports.$connect = void 0;
const aws_sdk_1 = require("aws-sdk");
const uuid_1 = require("uuid");
const _ = require("lodash");
const api = require("./api");
const db_1 = require("./db");
const apiUtil_1 = require("./apiUtil");
// all registered pilot connections
let clients = {};
let pilotToSocket = {};
// Do we have a viable connection to a pilot?
function hasSocket(pilot_id) {
    return pilotToSocket[pilot_id] != undefined;
}
// Do we have a viable session for the pilot?
function hasClient(socket) {
    return clients[socket] != undefined;
}
function isAuthed(socket) {
    if (clients[socket] != undefined) {
        return clients[socket].authentic;
    }
    return false;
}
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
const sendToOne = (socket, body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("sendTo:", socket, JSON.stringify(body));
        yield apiGateway.postToConnection({
            'ConnectionId': socket,
            'Data': Buffer.from(JSON.stringify(body)),
        }).promise();
    }
    catch (err) {
        console.error("sendTo", err);
    }
});
const sendToGroup = (group_id, action, msg, fromSocket) => __awaiter(void 0, void 0, void 0, function* () {
    if (group_id != api.nullID && db_1.myDB.hasGroup(group_id)) {
        console.log(`Group ${group_id} has ${db_1.myDB.groups[group_id].pilots.size} members`);
        // await Promise.all(Object.keys(myDB.groups[group_id].pilots).map(async (p) => {
        //     if (hasSocket(p) && pilotToSocket[p] != fromSocket) {
        //         console.log(`Sending to: ${p}`);
        //         await sendToOne(pilotToSocket[p], {action: action, body: msg});
        //     } else {
        //         console.log(`Not sending to: ${p}`);
        //     }
        // }));
        let all = [];
        db_1.myDB.groups[group_id].pilots.forEach((p) => __awaiter(void 0, void 0, void 0, function* () {
            if (hasSocket(p) && pilotToSocket[p] != fromSocket) {
                all.push(new Promise(() => __awaiter(void 0, void 0, void 0, function* () {
                    console.log(`Sending to: ${p}`);
                    yield sendToOne(pilotToSocket[p], { action: action, body: msg });
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
    if (hasSocket(socket)) {
        console.log(`${clients[socket].id}) dropped`);
        if (hasClient(clients[socket].id)) {
            delete pilotToSocket[clients[socket].id];
        }
        delete clients[socket];
    }
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
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    // fill in who message came from
    msg.pilot_id = clients[socket].id;
    console.log(`${clients[socket].id}) Msg:`, msg);
    // if no group or invalid group, ignore message
    // TODO: also check pilot is actually in that group
    if (msg.group_id == api.nullID || !db_1.myDB.hasGroup(msg.group_id)) {
        console.log("Msg was dropped.");
        return;
    }
    // record message into log
    db_1.myDB.recordChat(msg);
    // broadcast message to group
    yield sendToGroup(msg.group_id, "chatMessage", msg, socket);
});
exports.chatMessage = chatMessage;
// ========================================================================
// handle PilotTelemetry
// ------------------------------------------------------------------------
const pilotTelemetry = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    // TODO: Replace with better check
    // if (!myDB.hasPilot(msg.pilot_id)) return;
    msg.pilot_id = clients[socket].id;
    // record the location
    db_1.myDB.recordPilotTelemetry(msg);
    // if in group, broadcast location
    // TODO: only broadcast if it's recent location update?
    const group_id = db_1.myDB.pilots[clients[socket].id].group_id;
    yield sendToGroup(group_id, "pilotTelemetry", msg, socket);
});
exports.pilotTelemetry = pilotTelemetry;
// ========================================================================
// handle Full copy of flight plan from client
// ------------------------------------------------------------------------
const flightPlanSync = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const group_id = db_1.myDB.pilots[clients[socket].id].group_id;
    if (group_id == api.nullID)
        return;
    // update the plan
    db_1.myDB.groups[group_id].flight_plan = msg.flight_plan;
    // TODO: check the hash necessary here?
    // relay the flight plan to the group
    yield sendToGroup(group_id, "flightPlanSync", msg, socket);
});
exports.flightPlanSync = flightPlanSync;
// ========================================================================
// handle Flightplan Updates
// ------------------------------------------------------------------------
const flightPlanUpdate = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const group_id = db_1.myDB.pilots[clients[socket].id].group_id;
    if (group_id == api.nullID)
        return;
    console.log(`${clients[socket].id}) Waypoint Update`, msg);
    // make backup copy of the plan
    const plan = db_1.myDB.groups[group_id].flight_plan;
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
        console.warn(`${clients[socket].id}) Flightplan De-sync`, hash, msg.hash, plan);
        db_1.myDB.groups[group_id].flight_plan = backup;
        // assume the client is out of sync, return a full copy of the plan
        const notify = {
            timestamp: Date.now(),
            hash: (0, apiUtil_1.hash_flightPlanData)(backup),
            flight_plan: backup,
        };
        yield sendToOne(socket, { action: "flightPlanSync", body: notify });
    }
    else if (should_notify) {
        // relay the update to the group
        yield sendToGroup(group_id, "flightPlanUpdate", msg, socket);
    }
});
exports.flightPlanUpdate = flightPlanUpdate;
// ======================================================================== 
// handle waypoint selections
// ------------------------------------------------------------------------
const pilotWaypointSelections = (msg, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const group_id = db_1.myDB.pilots[clients[socket].id].group_id;
    if (group_id == api.nullID)
        return;
    console.log(`${clients[socket].id}) Waypoint Selection`, msg);
    // Save selection
    Object.entries(msg).forEach(([pilot_id, wp_index]) => {
        db_1.myDB.groups[group_id].wp_selections[pilot_id] = wp_index;
    });
    // relay the update to the group
    yield sendToGroup(group_id, "pilotWaypointSelections", msg, socket);
});
exports.pilotWaypointSelections = pilotWaypointSelections;
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
        secret_id: api.nullID,
        authentic: false,
    };
    const resp = {
        status: api.ErrorCode.unknown_error,
        secret_id: api.nullID,
        pilot_id: request.pilot.id,
        pilot_meta_hash: "",
        api_version: api.api_version,
        group_id: api.nullID
    };
    if (hasSocket(request.pilot.id) && hasClient(pilotToSocket[request.pilot.id]) && request.secret_id != clients[pilotToSocket[request.pilot.id]].secret_id) {
        console.warn(`${request.pilot.id}) attempt multiple connection during register`);
        resp.status = api.ErrorCode.unknown_error;
    }
    else if (request.pilot.name == "") {
        resp.status = api.ErrorCode.missing_data;
    }
    else {
        // use or create an id
        newClient.secret_id = request.secret_id || (0, uuid_1.v4)();
        newClient.id = request.pilot.id || (0, uuid_1.v4)().substr(24);
        console.log(`${newClient.id}) Authenticated`);
        newClient.authentic = true;
        // update db
        db_1.myDB.newPilot(request.pilot.name, newClient.id, newClient.secret_id, request.pilot.avatar);
        // respond success
        resp.status = api.ErrorCode.success;
        resp.secret_id = newClient.secret_id;
        resp.pilot_id = newClient.id;
        resp.pilot_meta_hash = (0, apiUtil_1.hash_pilotMeta)(db_1.myDB.pilots[newClient.id]);
        // remember this connection
        pilotToSocket[newClient.id] = socket;
        clients[socket] = newClient;
        // create a new group for the user
        const old_group = db_1.myDB.findGroup(newClient.id);
        if (old_group != api.nullID) {
            console.log(`${newClient.id}) Rejoining group ${old_group}`);
            resp.group_id = old_group;
        }
        else {
            resp.group_id = db_1.myDB.newGroup();
            db_1.myDB.addPilotToGroup(newClient.id, resp.group_id);
        }
    }
    yield sendToOne(socket, { action: "authResponse", body: resp });
});
exports.authRequest = authRequest;
// ========================================================================
// UpdateProfile
// ------------------------------------------------------------------------
const updateProfileRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    // check IDs
    if (!db_1.myDB.hasPilot(request.pilot.id)) {
        // Unknown pilot.
        // Respond Error.
        yield sendToOne(socket, { action: "updateProfileResponse", body: { status: api.ErrorCode.invalid_id } });
    }
    else if (request.secret_id != clients[socket].secret_id) {
        // Invalid secret_id
        // Respond Error.
        yield sendToOne(socket, { action: "updateProfileResponse", body: { status: api.ErrorCode.invalid_secret_id } });
    }
    else {
        // update
        console.log(`${clients[socket].id}) Updated profile.`);
        // TODO: force a size limit on avatar
        Object.assign(clients[socket], clients[socket], request.pilot);
        Object.assign(db_1.myDB.pilots[clients[socket].id], db_1.myDB.pilots[clients[socket].id], request.pilot);
        // TODO: notify group?
        // Respond Success
        yield sendToOne(socket, { action: "updateProfileResponse", body: { status: api.ErrorCode.success } });
    }
});
exports.updateProfileRequest = updateProfileRequest;
// ========================================================================
// Get Group Info
// ------------------------------------------------------------------------
const groupInfoRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const resp = {
        status: api.ErrorCode.unknown_error,
        group_id: request.group_id,
        map_layers: [],
        pilots: [],
        flight_plan: null
    };
    if (request.group_id == api.nullID || !db_1.myDB.hasGroup(request.group_id)) {
        // Null or unknown group_id.
        // Respond Error. 
        resp.status = api.ErrorCode.invalid_id;
    }
    else if (request.group_id != db_1.myDB.pilots[clients[socket].id].group_id) {
        // Pilot not in this group.
        // Respond Error. 
        resp.status = api.ErrorCode.denied_group_access;
    }
    else {
        // Respond Success
        resp.status = api.ErrorCode.success;
        resp.map_layers = db_1.myDB.groups[request.group_id].map_layers;
        db_1.myDB.groups[request.group_id].pilots.forEach((p) => {
            const each_pilot = {
                id: p,
                name: db_1.myDB.pilots[p].name,
                avatar: db_1.myDB.pilots[p].avatar,
            };
            resp.pilots.push(each_pilot);
        });
        resp.flight_plan = db_1.myDB.groups[request.group_id].flight_plan;
    }
    console.log(`${clients[socket].id}) requested group (${request.group_id}) info : ${resp.status}`);
    yield sendToOne(socket, { action: "groupInfoResponse", body: resp });
});
exports.groupInfoRequest = groupInfoRequest;
// ========================================================================
// Get Chat Log
// ------------------------------------------------------------------------
const chatLogRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    console.log(`${clients[socket].id}) Requested Chat Log from ${request.time_window.start} to ${request.time_window.end} for group_id ${request.group_id}`);
    const resp = {
        status: api.ErrorCode.unknown_error,
        msgs: [],
        group_id: request.group_id,
    };
    if (request.group_id == api.nullID || !db_1.myDB.hasGroup(request.group_id)) {
        // Null or unknown group_id.
        // Respond Error. 
        resp.status = api.ErrorCode.invalid_id;
    }
    else if (request.group_id != db_1.myDB.pilots[clients[socket].id].group_id) {
        // Pilot not in this group.
        // Respond Error. 
        resp.status = api.ErrorCode.denied_group_access;
    }
    else {
        // Respond Success
        resp.msgs = db_1.myDB.getChatLog(request.group_id, request.time_window);
        resp.status = api.ErrorCode.success;
    }
    yield sendToOne(socket, { action: "chatLogResponse", body: resp });
});
exports.chatLogRequest = chatLogRequest;
// ========================================================================
// user joins group
// ------------------------------------------------------------------------
const joinGroupRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const resp = {
        status: api.ErrorCode.unknown_error,
        group_id: api.nullID,
    };
    console.log(`${clients[socket].id}) requesting to join group ${request.group_id}`);
    if (db_1.myDB.hasGroup(request.group_id)) {
        // join a group
        if (request.group_id == db_1.myDB.pilots[clients[socket].id].group_id) {
            // already in this group
            resp.status = api.ErrorCode.no_op;
        }
        else {
            resp.status = api.ErrorCode.success;
        }
        resp.group_id = request.group_id;
        // TODO: joining directly on pilot is no longer supported.
        // } else if (myDB.hasPilot(request.group_id) && hasClient(request.group_id)) {
        //     // join on a pilot
        //     resp.status = api.ErrorCode.success;
        //     resp.group_id = myDB.pilots[request.group_id].group_id;
        //     if (resp.group_id == api.nullID) {
        //         // need to make a new group
        //         resp.group_id = myDB.newGroup();
        //         console.log(`${clients[socket].id}) Form new group ${resp.group_id} on ${request.group_id}`);
        //         myDB.addPilotToGroup(request.group_id, resp.group_id);
        //         // notify the pilot they are in a group now
        //         // TODO: we should have a dedicated message for this (don't overload the JoinGroupResponse like this)
        //         const notify = {
        //             status: api.ErrorCode.success,
        //             group_id: resp.group_id,
        //         } as api.JoinGroupResponse;
        //         clients[request.group_id].sendToOne(socket, {action: "joinGroupResponse", body: notify});
        //     }
    }
    else if (request.group_id != null && request.group_id != api.nullID) {
        // make the requested group
        resp.status = api.ErrorCode.success;
        resp.group_id = db_1.myDB.newGroup(request.group_id);
    }
    else {
        // bad group request. Can't make a new group with this id.
        resp.status = api.ErrorCode.invalid_id;
    }
    // If ID match, join the group
    if (resp.group_id != api.nullID) {
        // check if pilot was already in a group
        const prev_group = db_1.myDB.findGroup(clients[socket].id);
        if (prev_group != api.nullID) {
            // notify the old group
            const notify = {
                pilot_id: clients[socket].id,
                // TODO: populate if split is prompted
                new_group_id: api.nullID,
            };
            yield sendToGroup(prev_group, "pilotLeftGroup", notify, socket);
            db_1.myDB.removePilotFromGroup(clients[socket].id);
        }
        // add pilot to group
        db_1.myDB.addPilotToGroup(clients[socket].id, resp.group_id);
        // notify group there's a new pilot
        const notify = {
            pilot: {
                id: clients[socket].id,
                name: db_1.myDB.pilots[clients[socket].id].name,
                avatar: db_1.myDB.pilots[clients[socket].id].avatar,
            }
        };
        yield sendToGroup(resp.group_id, "pilotJoinedGroup", notify, socket);
    }
    yield sendToOne(socket, { action: "joinGroupResponse", body: resp });
});
exports.joinGroupRequest = joinGroupRequest;
// ========================================================================
// Leave Group
// ------------------------------------------------------------------------
const leaveGroupRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const resp = {
        status: api.ErrorCode.unknown_error,
        group_id: api.nullID,
    };
    if (db_1.myDB.pilots[clients[socket].id].group_id != api.nullID) {
        resp.status = api.ErrorCode.success;
        const notify = {
            pilot_id: clients[socket].id,
            new_group_id: api.nullID,
        };
        const prev_group = db_1.myDB.pilots[clients[socket].id].group_id;
        // Leave the group
        db_1.myDB.removePilotFromGroup(clients[socket].id);
        resp.group_id = db_1.myDB.newGroup();
        db_1.myDB.addPilotToGroup(clients[socket].id, resp.group_id);
        if (request.prompt_split) {
            // will let others know what new group pilot is joining
            notify.new_group_id = resp.group_id;
        }
        // notify the group
        yield sendToGroup(prev_group, "pilotLeftGroup", notify, socket);
    }
    else {
        // Pilot isn't currently in a group.
        // Return Error
        resp.status = api.ErrorCode.no_op;
    }
    yield sendToOne(socket, { action: "leaveGroupResponse", body: resp });
});
exports.leaveGroupRequest = leaveGroupRequest;
// ========================================================================
// Pilots Status
// ------------------------------------------------------------------------
const pilotsStatusRequest = (request, socket) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isAuthed(socket)) {
        console.error(`${socket}) is not authorized`);
        return;
    }
    ;
    const resp = {
        status: api.ErrorCode.missing_data,
        pilots_online: {}
    };
    // bad IDs will simply be reported offline
    Object.values(request.pilot_ids).forEach((pilot_id) => {
        resp.status = api.ErrorCode.success;
        // report "online" if we have authenticated connection with the pilot
        resp.pilots_online[pilot_id] = isAuthed(pilot_id);
    });
    yield sendToOne(socket, { action: "pilotsStatusResponse", body: resp });
});
exports.pilotsStatusRequest = pilotsStatusRequest;
