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

interface CachedPilot {
    pilot: Pilot
    timestamp: number
}

interface CachedClient {
    client: Client
    timestamp: number
}


export class db_dynamo {

    db: DynamoDB.DocumentClient

    // Caches
    pilotCache: Record<api.ID, CachedPilot>
    clientCache: Record<string, CachedClient>


    constructor() {
        this.db = new DynamoDB.DocumentClient({ region: 'us-west-1' });
        this.pilotCache = {}
        this.clientCache = {}
    }

    // ========================================================================
    // cache macros
    // ------------------------------------------------------------------------
    invalidateClientCache(socket: string): void {
        if (socket in this.clientCache) delete this.clientCache[socket];
    }

    invalidatePilotCache(id: api.ID): void {
        if (id in this.pilotCache) delete this.pilotCache[id];
    }

    writeClientCache(socket: string, client: Client): void {
        this.clientCache[socket] = { client: client, timestamp: Date.now() / 1000 } as CachedClient;
    }

    writePilotCache(id: api.ID, pilot: Pilot): void {
        this.pilotCache[id] = { pilot: pilot, timestamp: Date.now() / 1000 } as CachedPilot;
    }

    // ========================================================================
    // dynamoDB getters
    // ------------------------------------------------------------------------
    async fetchClientInfo(socket: string): Promise<Client> {
        if (socket in this.clientCache && this.clientCache[socket].timestamp > (Date.now() / 1000 - 60)) {
            // Cache Hit
            return this.clientCache[socket].client;
        } else {
            // Cache Miss
            const _c = (await this.db.get({
                TableName: "Sockets",
                Key: { socket: socket },
            }).promise()).Item as Client;
            this.writeClientCache(socket, _c);
            return _c;
        }
    }

    async fetchPilot(pilot_id: api.ID): Promise<Pilot> {
        if (pilot_id != undefined) {
            if (pilot_id in this.pilotCache && this.pilotCache[pilot_id].timestamp > (Date.now() / 1000 - 60)) {
                // Cache Hit
                return this.pilotCache[pilot_id].pilot;
            } else {
                // Cache Miss
                const _p = (await this.db.get({
                    TableName: "Pilots",
                    Key: { id: pilot_id },
                }).promise()).Item as Pilot;
                this.writePilotCache(pilot_id, _p);
                return _p;
            }
        } else {
            return undefined;
        }
    }

    async fetchGroup(group_id: api.ID): Promise<Group> {
        if (group_id != undefined) {
            const _group = (await this.db.get({
                TableName: "Groups",
                Key: { id: group_id },
            }).promise()).Item;
            if (_group != undefined) {
                return {
                    pilots: new Set(_group.pilots?.values || []),
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
        if (client.pilot_id == undefined || client.socket == undefined) return new Promise<void>((resolve) => { resolve() });
        this.writeClientCache(client.socket, client);
        // Update Client
        return this.db.put({
            TableName: "Sockets",
            Item: client,
        }, function (err, data) {
            if (err) console.log(err);
            // else console.log(data);
        }).promise();
    }

    async pushPilot(client: Client, pilot: Pilot) {
        this.writePilotCache(pilot.id, pilot);
        await this.db.put({
            TableName: "Pilots",
            Item: {
                id: pilot.id,
                name: pilot.name,
                avatar_hash: pilot.avatar_hash,
                secret_id: pilot.secret_id,
                socket: pilot.socket,
                group_id: pilot.group_id,
                tier: pilot.tier,
                expires: Date.now() / 1000 + 30 * 24 * 60 * 60, // 30 days
            }
        }, function (err, data) {
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
                    expires: Date.now() / 1000 + 72 * 60 * 60, // 72 hr
                    wp_selections: {},
                }
            }, function (err, data) {
                if (err) console.log(err);
                // else console.log(data);
            });
        }

        return [
            // Update Group
            this.db.update({
                TableName: "Groups",
                Key: { id: group_id },
                UpdateExpression: "ADD pilots :pilots",
                ExpressionAttributeValues: {
                    ':pilots': this.db.createSet([pilot_id]),
                },
            }, function (err, data) {
                if (err) console.log("Error adding to group.pilots", err);
                // else console.log(data);
            }).promise(),

            // Update Pilot
            this.db.update({
                TableName: "Pilots",
                Key: { id: pilot_id },
                UpdateExpression: "SET group_id = :_group_id",
                ExpressionAttributeValues: {
                    ":_group_id": group_id
                }
            }, function (err, data) {
                if (err) console.log("Error updating pilot.group", err);
                // else console.log(data);
            }).promise()
        ];
    }

    async _popPilotFromGroup(pilot_id: api.ID, group_id: api.ID): Promise<Promise<any>[]> {
        // Update Group

        const group = await this.fetchGroup(group_id);
        if (group != undefined) {
            return [
                // Update Group
                this.db.update({
                    TableName: "Groups",
                    Key: {
                        id: group_id,
                    },
                    UpdateExpression: "DELETE pilots :pilots",
                    ExpressionAttributeValues: {
                        ':pilots': this.db.createSet([pilot_id])
                    },
                }, function (err, data) {
                    if (err) console.log(err);
                    // else console.log(data);
                }).promise(),

                // Update Pilot
                this.db.update({
                    TableName: "Pilots",
                    Key: { id: pilot_id },
                    UpdateExpression: "SET group_id = :_group_id",
                    ExpressionAttributeValues: {
                        ":_group_id": api.nullID
                    }
                }, function (err, data) {
                    if (err) console.log("Error updating pilot.group", err);
                    // else console.log(data);
                }).promise()
            ];
        } else {
            return [];
        }
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
        }, function (err, data) {
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
            UpdateExpression: "SET wp_selections.#pilot_id = :index",
            ExpressionAttributeNames: {
                '#pilot_id': pilot_id,
            },
            ExpressionAttributeValues: {
                ':index': index,
            },
        }, function (err, data) {
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

            this.invalidateClientCache(client.socket);
            this.invalidatePilotCache(client.pilot_id);

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
                Key: { socket: client.socket }
            });
        }
    }


    // ========================================================================
    // Pilot / Group Utils
    // ------------------------------------------------------------------------
    async addPilotToGroup(pilot_id: api.ID, group_id?: api.ID, pilot?: Pilot): Promise<api.ID> {
        const _group_id = group_id || uuidv4().substr(0, 8);

        // Remove pilot from current group (if applicable)
        if (pilot != undefined && (pilot.group_id != null && pilot.group_id != api.nullID)) {
            await Promise.all(await this._popPilotFromGroup(pilot.id, pilot.group_id));
        }

        await Promise.all(await this._pushPilotIntoGroup(pilot_id, _group_id));
        return _group_id;
    }

    async checkSecret(pilot_id: api.ID, secret: string): Promise<boolean> {
        const pilot = await this.fetchPilot(pilot_id);
        return pilot_id != undefined && secret != undefined && pilot.secret_id == secret;
    }
}
