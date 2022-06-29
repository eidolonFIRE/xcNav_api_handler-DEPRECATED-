import * as api from "./api";


// Custom high-speed dirty hash for checking flightplan changes
export function hash_flightPlanData(plan: api.FlightPlanData): string {
    // build long string
    let str = "Plan";
    plan.forEach((wp, i) => {
        str += i + wp.name + (wp.icon ?? "") + (wp.color ?? "") + (wp.optional ? "O" : "X");
        wp.latlng.forEach((g) => {
            // large tolerance for floats
            str += g[0].toFixed(5) + g[1].toFixed(5);
        });
    });
    
    // fold string into hash
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash &= 0xffffff;
    }
    return (hash < 0 ? hash * -2 : hash).toString(16);
}

// Custom high-speed dirty hash
export function hash_pilotMeta(pilot: api.PilotMeta): string {
    // build long string
    const str = "Meta" + pilot.name + pilot.id + pilot.avatar_hash + (pilot.tier || "");
    
    // fold string into hash
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash &= 0xffffff;
    }
    return (hash < 0 ? hash * -2 : hash).toString(16);
}
