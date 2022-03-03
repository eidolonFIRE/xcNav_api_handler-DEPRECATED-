import * as api from "./api";


// Custom high-speed dirty hash for checking flightplan changes
export function hash_flightPlanData(plan: api.FlightPlanData): string {
    // build long string
    let str = "Plan";
    str += plan.name;
    plan.waypoints.forEach((wp, i) => {
        str += i + wp.name + (wp.optional ? "O" : "X");
        wp.geo.forEach((g) => {
            // large tolerance for floats
            str += g.lat.toFixed(4) + g.lng.toFixed(4);
        });
    });
    
    // fold string into hash
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return (hash < 0 ? hash * -2 : hash).toString(16);
}

// Custom high-speed dirty hash
export function hash_pilotMeta(pilot: api.PilotMeta): string {
    // build long string
    const str = "Meta" + pilot.name + pilot.id + pilot.avatar;
    
    // fold string into hash
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return (hash < 0 ? hash * -2 : hash).toString(16);
}
