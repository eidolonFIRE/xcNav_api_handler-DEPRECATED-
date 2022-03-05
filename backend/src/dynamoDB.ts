// TODO: add a real database here. For now this will just be realtime state

import { v4 as uuidv4 } from "uuid";
import * as api from "./api";
import { DynamoDB } from 'aws-sdk';


export interface Pilot extends api.PilotMeta {
    group: api.ID
    socket: string
    secret_id: string
}

export interface Group {
    pilots: Set<api.ID>
    chat: api.ChatMessage[]
    flight_plan: api.FlightPlanData
    wp_selections: api.PilotWaypointSelections
}

export interface Client {
    id: api.ID
    authorized: boolean
}


export class db_dynamo {

    // tables: pilot / groups
    // pilots: Record<api.ID, Pilot>;
    // groups: Record<api.ID, Group>;

    // pilot data
    // pilot_telemetry: Record<api.ID, api.PilotTelemetry[]>;

    // all registered pilot connections
    _socketInfo: Record<string, Client>;
    // _pilotToSocket: Record<api.ID, string>;

    db: DynamoDB.DocumentClient;


    constructor() {
        // initiate everything empty
        // this.pilots = {};
        // this.groups = {};


        this._socketInfo = {};
        // this._pilotToSocket = {};

        this.db = new DynamoDB.DocumentClient({region: 'us-west-1'}); 
    }

    // ========================================================================
    // dynamoDB getters
    // ------------------------------------------------------------------------
    async fetchPilot(pilot_id: api.ID): Promise<Pilot> {
        return (await this.db.get({
                TableName: "Pilots", 
                Key: {"id": pilot_id},
            }).promise()).Item as Pilot;
    }

    async fetchGroup(group_id: api.ID): Promise<Group> {
        return (await this.db.get({
                TableName: "Groups", 
                Key: {"id": group_id},
            }).promise()).Item as Group;
    }

    // ========================================================================
    // dynamoDB setters
    // ------------------------------------------------------------------------
    async pushPilotIntoGroup(pilot_id: api.ID, group_id: api.ID): Promise<Promise<any>[]> {
        return [
            // Update Group
            this.db.update({
                TableName: "Groups",
                Key: {
                    id: group_id,
                },
                UpdateExpression : "ADD pilots :pilots",            
                ExpressionAttributeValues: {
                    ':pilots': this.db.createSet([pilot_id])             
                },
            }, function(err, data) {
                if (err) console.log(err);
                // else console.log(data);
            }).promise(),

            // Update Pilot
            this.db.put({
                TableName: "Pilots",
                Item: {
                    id: pilot_id,
                    group: group_id, 
                }
            }, function(err, data) {
                if (err) console.log(err);
                // else console.log(data);
            }).promise()
        ];
    }

    async popPilotFromGroup(pilot_id: api.ID, group_id: api.ID): Promise<any> {
        // Update Group
        return this.db.update({
            TableName: "Groups",
            Key: {
                id: group_id,
            },
            UpdateExpression : "DELET pilots :pilots",            
            ExpressionAttributeValues: {
                ':pilots': this.db.createSet([pilot_id])             
            },
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        }).promise();
    }

    async pushFlightPlan(group_id: api.ID, plan: api.FlightPlanData): Promise<any> {
        // Update Pilot
        return this.db.put({
            TableName: "Groups",
            Item: {
                id: group_id,
                flight_plan: plan 
            }
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        }).promise();
    }

    async setPilotWaypointSelection(group_id: api.ID, pilot_id: api.ID, index: number): Promise<any> {
        // Update Group
        return this.db.update({
            TableName: "Groups",
            Key: {
                id: group_id,
            },
            UpdateExpression : "SET wp_selections.#pilot_id = :index",            
            ExpressionAttributeValues: {
                '#pilot_id': pilot_id,
                ':index': index,
            },
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        }).promise();
    }

    // ========================================================================
    // Socket / Client management
    // ------------------------------------------------------------------------

    isAuthed(socket: string): boolean {
        if (this._socketInfo[socket] != undefined) {
            return this._socketInfo[socket].authorized;
        } else {
            console.warn(`Checked for auth on unrecognized socket: ${socket}`);
            return false;
        }
    }

    socketToPilot(socket: string): api.ID {
        if (this._socketInfo[socket] != undefined) {
            return this._socketInfo[socket].id;
        } else {
            return api.nullID;
        }
    }


    clientDropped(socket: string) {
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

    authConnection(socket: string, client: Client, pilot: Pilot) {
        this.db.put({
          TableName: "Pilots",
          Item: pilot
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        });
        this._socketInfo[socket] = client;
    }

    updateProfile(pilot_id: api.ID, name: string, avatar: string) {
        this.db.put({
            TableName: "Pilots",
            Item: {
                id: pilot_id,
                name: name,
                avatar: avatar
            }
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        });
    }


    // ========================================================================
    // Pilot / Group Utils
    // ------------------------------------------------------------------------
    async addPilotToGroup(pilot_id: api.ID, group_id?: api.ID): Promise<api.ID> {
        const _group_id = group_id || uuidv4().substr(0, 8);

        // TODO: make pilot leave previous group
        this.pushPilotIntoGroup(pilot_id, group_id);
        return _group_id;
    }

    async checkSecret(pilot_id: api.ID, secret: string): Promise<boolean> {
        const pilot = await this.fetchPilot(pilot_id);
        return pilot_id != undefined && secret != undefined && pilot.secret_id == secret;
    }


    // TODO
    // // ========================================================================
    // // Chat
    // // ------------------------------------------------------------------------
    // recordChat(msg: api.ChatMessage) {
    //     // TODO: preserve indexing and order by timestamp
    //     this.groups[msg.group_id].chat.push(msg);
    // }

    // getChatLog(group_id: api.ID, duration: api.Duration): api.ChatMessage[] {
    //     if (!this.hasGroup(group_id)) {
    //         console.error("Group does not exist!");
    //         return [];
    //     }

    //     function bisect(v: api.ChatMessage[], t: api.Timestamp): number
    //     {
    //         let low = 0;
    //         let mid = 0;
    //         let high = v.length - 1;
     
    //         while (low <= high) {
    //             mid = (low + high) / 2;
     
    //             if(t < v[mid].timestamp) {
    //                 high = mid - 1;
    //             } else if(t > v[mid].timestamp) {
    //                 low = mid + 1;
    //             } else {
    //                 return mid;
    //             }
    //         }
    //         // default to start
    //         return 0;
    //     }

    //     // find start and end index
    //     const log = this.groups[group_id].chat;
    //     const start = bisect(log, duration.start);
    //     const end = bisect(log, duration.end);

    //     // return slice
    //     return log.slice(start, end);
    // }
}



