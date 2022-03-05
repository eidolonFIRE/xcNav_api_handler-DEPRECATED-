"use strict";
// TODO: add a real database here. For now this will just be realtime state
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
exports.db_dynamo = void 0;
const uuid_1 = require("uuid");
const api = require("./api");
const aws_sdk_1 = require("aws-sdk");
class db_dynamo {
    constructor() {
        // initiate everything empty
        // this.pilots = {};
        // this.groups = {};
        this._socketInfo = {};
        // this._pilotToSocket = {};
        this.db = new aws_sdk_1.DynamoDB.DocumentClient({ region: 'us-west-1' });
    }
    // ========================================================================
    // dynamoDB getters
    // ------------------------------------------------------------------------
    fetchPilot(pilot_id) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.db.get({
                TableName: "Pilots",
                Key: { "id": pilot_id },
            }).promise()).Item;
        });
    }
    fetchGroup(group_id) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.db.get({
                TableName: "Groups",
                Key: { "id": group_id },
            }).promise()).Item;
        });
    }
    // ========================================================================
    // dynamoDB setters
    // ------------------------------------------------------------------------
    pushPilotIntoGroup(pilot_id, group_id) {
        return __awaiter(this, void 0, void 0, function* () {
            return [
                // Update Group
                this.db.update({
                    TableName: "Groups",
                    Key: {
                        id: group_id,
                    },
                    UpdateExpression: "ADD pilots :pilots",
                    ExpressionAttributeValues: {
                        ':pilots': this.db.createSet([pilot_id])
                    },
                }, function (err, data) {
                    if (err)
                        console.log(err);
                    // else console.log(data);
                }).promise(),
                // Update Pilot
                this.db.put({
                    TableName: "Pilots",
                    Item: {
                        id: pilot_id,
                        group: group_id,
                    }
                }, function (err, data) {
                    if (err)
                        console.log(err);
                    // else console.log(data);
                }).promise()
            ];
        });
    }
    popPilotFromGroup(pilot_id, group_id) {
        return __awaiter(this, void 0, void 0, function* () {
            // Update Group
            return this.db.update({
                TableName: "Groups",
                Key: {
                    id: group_id,
                },
                UpdateExpression: "DELET pilots :pilots",
                ExpressionAttributeValues: {
                    ':pilots': this.db.createSet([pilot_id])
                },
            }, function (err, data) {
                if (err)
                    console.log(err);
                // else console.log(data);
            }).promise();
        });
    }
    pushFlightPlan(group_id, plan) {
        return __awaiter(this, void 0, void 0, function* () {
            // Update Pilot
            return this.db.put({
                TableName: "Groups",
                Item: {
                    id: group_id,
                    flight_plan: plan
                }
            }, function (err, data) {
                if (err)
                    console.log(err);
                // else console.log(data);
            }).promise();
        });
    }
    setPilotWaypointSelection(group_id, pilot_id, index) {
        return __awaiter(this, void 0, void 0, function* () {
            // Update Group
            return this.db.update({
                TableName: "Groups",
                Key: {
                    id: group_id,
                },
                UpdateExpression: "SET wp_selections.#pilot_id = :index",
                ExpressionAttributeValues: {
                    '#pilot_id': pilot_id,
                    ':index': index,
                },
            }, function (err, data) {
                if (err)
                    console.log(err);
                // else console.log(data);
            }).promise();
        });
    }
    // ========================================================================
    // Socket / Client management
    // ------------------------------------------------------------------------
    isAuthed(socket) {
        if (this._socketInfo[socket] != undefined) {
            return this._socketInfo[socket].authorized;
        }
        else {
            console.warn(`Checked for auth on unrecognized socket: ${socket}`);
            return false;
        }
    }
    socketToPilot(socket) {
        if (this._socketInfo[socket] != undefined) {
            return this._socketInfo[socket].id;
        }
        else {
            return api.nullID;
        }
    }
    clientDropped(socket) {
        if (this._socketInfo[socket] != undefined) {
            const pilot_id = this._socketInfo[socket].id;
            console.log(`${pilot_id}) dropped`);
            // clear the socket
            this.db.put({
                TableName: "Pilots",
                Item: {
                    id: pilot_id,
                    socket: socket,
                }
            });
            delete this._socketInfo[socket];
        }
    }
    authConnection(socket, client, pilot) {
        this.db.put({
            TableName: "Pilots",
            Item: pilot
        }, function (err, data) {
            if (err)
                console.log(err);
            // else console.log(data);
        });
        this._socketInfo[socket] = client;
    }
    updateProfile(pilot_id, name, avatar) {
        this.db.put({
            TableName: "Pilots",
            Item: {
                id: pilot_id,
                name: name,
                avatar: avatar
            }
        }, function (err, data) {
            if (err)
                console.log(err);
            // else console.log(data);
        });
    }
    // ========================================================================
    // Pilot / Group Utils
    // ------------------------------------------------------------------------
    addPilotToGroup(pilot_id, group_id) {
        return __awaiter(this, void 0, void 0, function* () {
            const _group_id = group_id || (0, uuid_1.v4)().substr(0, 8);
            // TODO: make pilot leave previous group
            this.pushPilotIntoGroup(pilot_id, group_id);
            return _group_id;
        });
    }
    checkSecret(pilot_id, secret) {
        return __awaiter(this, void 0, void 0, function* () {
            const pilot = yield this.fetchPilot(pilot_id);
            return pilot_id != undefined && secret != undefined && pilot.secret_id == secret;
        });
    }
}
exports.db_dynamo = db_dynamo;
