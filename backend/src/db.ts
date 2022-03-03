// TODO: add a real database here. For now this will just be realtime state

import { v4 as uuidv4 } from "uuid";
import * as api from "./api";


interface PilotContact extends api.PilotMeta {
    secret_id: api.ID
    group_id: api.ID
}

interface Group {
    pilots: Set<api.ID>
    chat: api.ChatMessage[]
    map_layers: string[]
    flight_plan: api.FlightPlanData
    wp_selections: api.PilotWaypointSelections
}


class db_stub {

    // tables: pilot / groups
    pilots: Record<api.ID, PilotContact>;
    groups: Record<api.ID, Group>;

    // pilot data
    pilot_telemetry: Record<api.ID, api.PilotTelemetry[]>;


    constructor() {
        // initiate everything empty
        this.pilots = {};
        this.groups = {};
        this.pilot_telemetry = {};
    }

    // ========================================================================
    // Pilot / Group Utils
    // ------------------------------------------------------------------------
    hasGroup(group_id: api.ID): boolean {
        return this.groups[group_id] != undefined;
    }

    hasPilot(pilot_id: api.ID): boolean {
        return this.pilots[pilot_id] != undefined;
    }

    findGroup(pilot_id: api.ID) {
        if (this.hasPilot(pilot_id)) {
            const group_id = this.pilots[pilot_id].group_id;
            if (group_id != api.nullID) {
                return this.pilots[pilot_id].group_id;
            } else {
                console.warn("Pilot", pilot_id, "is not in a group.");
                return api.nullID;
            }
        } else {
            console.warn("Unknown pilot", pilot_id);
            return api.nullID;
        }
    }

    newPilot(name: string, id: api.ID, secret_id: api.ID, avatar: string) {
        const newPilot: PilotContact = {
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
    newGroup(group_id: api.ID = undefined): api.ID {
        let new_group_id = uuidv4().substr(0, 8);
        if (group_id != undefined) {
            // use requested ID
            new_group_id = group_id;
        }
        if (this.hasGroup(new_group_id)) {
            console.error("New group already exists!");
        } else {
            // initialize new group
            this.groups[new_group_id] = {
                pilots: new Set(),
                chat: [],
                map_layers: [],
                flight_plan: {
                    name: "group",
                    waypoints: [],
                } as api.FlightPlanData,
                wp_selections: {}
            } as Group;
        }
        return new_group_id;
    }

    addPilotToGroup(pilot_id: api.ID, group_id: api.ID) {
        // if group doesn't exist, make it
        if (!this.hasGroup(group_id)) {
            this.newGroup(group_id);
        }
        if (myDB.hasPilot(pilot_id)) {
            this.groups[group_id].pilots.add(pilot_id);
            this.pilots[pilot_id].group_id = group_id;
            console.log(`${pilot_id}) joined group ${group_id}`);
        } else {
            console.error("Unknown Pilot", pilot_id);
        }
    }

    removePilotFromGroup(pilot_id: api.ID) {
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
    recordChat(msg: api.ChatMessage) {
        // TODO: preserve indexing and order by timestamp
        this.groups[msg.group_id].chat.push(msg);
    }

    getChatLog(group_id: api.ID, duration: api.Duration): api.ChatMessage[] {
        if (!this.hasGroup(group_id)) {
            console.error("Group does not exist!");
            return [];
        }

        function bisect(v: api.ChatMessage[], t: api.Timestamp): number
        {
            let low = 0;
            let mid = 0;
            let high = v.length - 1;
     
            while (low <= high) {
                mid = (low + high) / 2;
     
                if(t < v[mid].timestamp) {
                    high = mid - 1;
                } else if(t > v[mid].timestamp) {
                    low = mid + 1;
                } else {
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
    recordPilotTelemetry(loc: api.PilotTelemetry) {
        // TODO: ensure insertion in order (preserve time ordering)
        this.pilot_telemetry[loc.pilot_id].push(loc);
    }
}



// singleton class representing a db interface
export let myDB = new db_stub();
