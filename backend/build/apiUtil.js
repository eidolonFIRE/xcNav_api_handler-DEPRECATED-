"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hash_pilotMeta = exports.hash_flightPlanData = void 0;
// Custom high-speed dirty hash for checking flightplan changes
function hash_flightPlanData(plan) {
    // build long string
    let str = "Plan";
    plan.forEach((wp, i) => {
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
exports.hash_flightPlanData = hash_flightPlanData;
// Custom high-speed dirty hash
function hash_pilotMeta(pilot) {
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
exports.hash_pilotMeta = hash_pilotMeta;
