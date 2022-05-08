// TODO: add a real database here. For now this will just be realtime state

import { v4 as uuidv4 } from "uuid";
import * as api from "./api";
import { DynamoDB } from 'aws-sdk';


export interface Pilot extends api.PilotMeta {
    group_id: api.ID
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
    pilot_id: api.ID
    socket: string
    expires: number
}


export class db_dynamo {

    // tables: pilot / groups
    // pilots: Record<api.ID, Pilot>;
    // groups: Record<api.ID, Group>;

    // pilot data
    // pilot_telemetry: Record<api.ID, api.PilotTelemetry[]>;

    // all registered pilot connections
    // _pilotToSocket: Record<api.ID, string>;

    db: DynamoDB.DocumentClient;


    constructor() {
        this.db = new DynamoDB.DocumentClient({region: 'us-west-1'}); 
    }

    // ========================================================================
    // dynamoDB getters
    // ------------------------------------------------------------------------
    async fetchSocketInfo(socket: string): Promise<Client> {
        return (await this.db.get({
            TableName: "Sockets", 
            Key: {socket: socket},
        }).promise()).Item as Client;
    }

    async fetchPilot(pilot_id: api.ID): Promise<Pilot> {
        if (pilot_id != undefined) {
            return (await this.db.get({
                    TableName: "Pilots", 
                    Key: {id: pilot_id},
                }).promise()).Item as Pilot;
        } else {
            return undefined;
        }
    }

    async fetchGroup(group_id: api.ID): Promise<Group> {
        if (group_id != undefined) {            
            const _group = (await this.db.get({
                TableName: "Groups", 
                Key: {id: group_id},
            }).promise()).Item;
            if (_group != undefined) {
                return {
                    pilots: new Set(_group.pilots.values),
                    chat: _group.chat,
                    flight_plan: JSON.parse(_group.flight_plan || "[]"),
                    wp_selections: _group.wp_selections
                } as Group;
            } else {
                return undefined;
            }
        } else {
            return undefined;
        }
    }

    // ========================================================================
    // dynamoDB setters
    // ------------------------------------------------------------------------
    async setSocketInfo(client: Client): Promise<any> {
        if (client.pilot_id == undefined || client.socket == undefined) return new Promise<void>((resolve)=>{resolve()});
        // Update Client
        return this.db.put({
            TableName: "Sockets",
            Item: client,
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        }).promise();
    }

    async pushPilot(client: Client, pilot: Pilot) {
        await this.db.put({
          TableName: "Pilots",
          Item: {
              id: pilot.id,
              name: pilot.name,
              avatar_hash: pilot.avatar_hash,
              secret_id: pilot.secret_id,
              socket: pilot.socket,
              group_id: pilot.group_id,
              expires: Date.now() + 12 * 60 * 60,
          }
        }, function(err, data) {
            if (err) console.log(err);
            // else console.log(data);
        });
        await this.setSocketInfo(client);
    }

    async _pushPilotIntoGroup(pilot_id: api.ID, group_id: api.ID): Promise<Promise<any>[]> {
        if (pilot_id == undefined || pilot_id == api.nullID || group_id == undefined || group_id == api.nullID) {
            console.error(`Tried to push pilot ${pilot_id} into group ${group_id}`);
            return [];
        }

        // check if group exists.
        const group = await this.fetchGroup(group_id);
        if (group == undefined) {
            console.log(`Created group table: ${group_id}`);
            await this.db.put({
                TableName: "Groups",
                Item: {
                    id: group_id,
                    expires: Date.now() + 12 * 60 * 60,
                    wp_selections: {},
                }
            }, function(err, data) {
                if (err) console.log(err);
                // else console.log(data);
            });
        }

        return [
            // Update Group
            this.db.update({
                TableName: "Groups",
                Key: {id: group_id},
                UpdateExpression: "ADD pilots :pilots",            
                ExpressionAttributeValues: {
                    ':pilots': this.db.createSet([pilot_id]),  
                },
            }, function(err, data) {
                if (err) console.log("Error adding to group.pilots", err);
                // else console.log(data);
            }).promise(),

            // Update Pilot
            this.db.update({
                TableName: "Pilots",
                Key: {id: pilot_id},
                UpdateExpression: "SET group_id = :_group_id",
                ExpressionAttributeValues: {
                    ":_group_id": group_id
                }
            }, function(err, data) {
                if (err) console.log("Error updating pilot.group", err);
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
            UpdateExpression: "DELETE pilots :pilots",            
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
        return this.db.update({
            TableName: "Groups",
            Key: {
                id: group_id,
            },
            UpdateExpression: "SET flight_plan = :_flight_plan",
            ExpressionAttributeValues: {
                ":_flight_plan": JSON.stringify(plan, (key, val) => {
                    return typeof val === 'number' ? Number(val.toFixed(5)) : val;
                  })
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
            ExpressionAttributeNames: {
                '#pilot_id': pilot_id,
            },
            ExpressionAttributeValues: {
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
    clientDropped(client: Client) {
        if (client != undefined) {
            console.log(`${client.pilot_id}) dropped`);
            // clear the socket
            this.db.put({
                TableName: "Pilots",
                Item: {
                    id: client.pilot_id,
                    socket: "",
                }
                });
            this.db.delete({
                    TableName: "Sockets",
                    Key: {socket: client.socket}
                });
        }
    }


    // ========================================================================
    // Pilot / Group Utils
    // ------------------------------------------------------------------------
    async addPilotToGroup(pilot_id: api.ID, group_id?: api.ID): Promise<api.ID> {
        const _group_id = group_id || uuidv4().substr(0, 8);

        // TODO: make pilot leave previous group
        await Promise.all(await this._pushPilotIntoGroup(pilot_id, _group_id));
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



