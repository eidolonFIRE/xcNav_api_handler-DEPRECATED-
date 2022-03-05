"use strict";
// TODO: add a real database here. For now this will just be realtime state
Object.defineProperty(exports, "__esModule", { value: true });
exports.db_stub = void 0;
const uuid_1 = require("uuid");
const api = require("./api");
class db_stub {
    constructor() {
        // initiate everything empty
        this.pilots = {};
        this.groups = {};
        this.pilot_telemetry = {};
        this._clients = {};
        this._pilotToSocket = {};
    }
    // ========================================================================
    // Socket / Client management
    // ------------------------------------------------------------------------
    // Do we have a viable connection to a pilot?
    hasSocket(pilot_id) {
        return this._pilotToSocket[pilot_id] != undefined;
    }
    // Do we have a viable session for the pilot?
    hasClient(socket) {
        return this._clients[socket] != undefined;
    }
    isAuthed(socket) {
        if (this._clients[socket] != undefined) {
            return this._clients[socket].authorized;
        }
        else {
            console.warn(`Checked for auth on unrecognized socket: ${socket}`);
            return false;
        }
    }
    socketToPilot(socket) {
        if (this.hasClient(socket)) {
            return this._clients[socket].id;
        }
        else {
            return api.nullID;
        }
    }
    findSocket(pilot_id) {
        if (this.hasSocket(pilot_id))
            return this._pilotToSocket[pilot_id];
    }
    clientDropped(socket) {
        if (this.hasSocket(socket)) {
            console.log(`${this._clients[socket].id}) dropped`);
            if (this.hasClient(this._clients[socket].id)) {
                delete this._pilotToSocket[this._clients[socket].id];
            }
            delete this._clients[socket];
        }
    }
    newConnection(newClient, socket) {
        this._clients[socket] = newClient;
        this._pilotToSocket[newClient.id] = socket;
    }
    checkSecret(socket, secret_id) {
        if (this.hasClient(socket)) {
            return this._clients[socket].secret_id == secret_id;
        }
        else {
            return false;
        }
    }
    updateProfile(pilot_id, name, avatar) {
        if (this.hasPilot(pilot_id)) {
            this.pilots[pilot_id].name = name;
            this.pilots[pilot_id].avatar = avatar;
        }
    }
    // ========================================================================
    // Pilot / Group Utils
    // ------------------------------------------------------------------------
    hasGroup(group_id) {
        return this.groups[group_id] != undefined;
    }
    hasPilot(pilot_id) {
        return this.pilots[pilot_id] != undefined;
    }
    findGroup(pilot_id) {
        if (this.hasPilot(pilot_id)) {
            const group_id = this.pilots[pilot_id].group_id;
            if (group_id != api.nullID) {
                return this.pilots[pilot_id].group_id;
            }
            else {
                console.warn("Pilot", pilot_id, "is not in a group.");
                return api.nullID;
            }
        }
        else {
            console.warn("Unknown pilot", pilot_id);
            return api.nullID;
        }
    }
    newPilot(name, id, secret_id, avatar) {
        const newPilot = {
            name: name,
            id: id,
            secret_id: secret_id,
            group_id: api.nullID,
            avatar: avatar,
        };
        this.pilots[id] = newPilot;
        this.pilot_telemetry[id] = [];
    }
    // Create a new group
    newGroup(group_id = undefined) {
        let new_group_id = (0, uuid_1.v4)().substr(0, 8);
        if (group_id != undefined) {
            // use requested ID
            new_group_id = group_id;
        }
        if (this.hasGroup(new_group_id)) {
            console.error("New group already exists!");
        }
        else {
            // initialize new group
            this.groups[new_group_id] = {
                pilots: new Set(),
                chat: [],
                map_layers: [],
                flight_plan: {
                    name: "group",
                    waypoints: [],
                },
                wp_selections: {}
            };
        }
        return new_group_id;
    }
    addPilotToGroup(pilot_id, group_id) {
        // if group doesn't exist, make it
        if (!this.hasGroup(group_id)) {
            this.newGroup(group_id);
        }
        if (this.hasPilot(pilot_id)) {
            this.groups[group_id].pilots.add(pilot_id);
            this.pilots[pilot_id].group_id = group_id;
            console.log(`${pilot_id}) joined group ${group_id}`);
        }
        else {
            console.error("Unknown Pilot", pilot_id);
        }
    }
    removePilotFromGroup(pilot_id) {
        if (this.hasPilot(pilot_id)) {
            if (this.pilots[pilot_id].group_id != api.nullID) {
                this.groups[this.pilots[pilot_id].group_id].pilots.delete(pilot_id);
                this.pilots[pilot_id].group_id = api.nullID;
            }
        }
    }
    // ========================================================================
    // Chat
    // ------------------------------------------------------------------------
    recordChat(msg) {
        // TODO: preserve indexing and order by timestamp
        this.groups[msg.group_id].chat.push(msg);
    }
    getChatLog(group_id, duration) {
        if (!this.hasGroup(group_id)) {
            console.error("Group does not exist!");
            return [];
        }
        function bisect(v, t) {
            let low = 0;
            let mid = 0;
            let high = v.length - 1;
            while (low <= high) {
                mid = (low + high) / 2;
                if (t < v[mid].timestamp) {
                    high = mid - 1;
                }
                else if (t > v[mid].timestamp) {
                    low = mid + 1;
                }
                else {
                    return mid;
                }
            }
            // default to start
            return 0;
        }
        // find start and end index
        const log = this.groups[group_id].chat;
        const start = bisect(log, duration.start);
        const end = bisect(log, duration.end);
        // return slice
        return log.slice(start, end);
    }
    // ========================================================================
    // Location
    // ------------------------------------------------------------------------
    recordPilotTelemetry(loc) {
        // TODO: ensure insertion in order (preserve time ordering)
        this.pilot_telemetry[loc.pilot_id].push(loc);
    }
}
exports.db_stub = db_stub;
