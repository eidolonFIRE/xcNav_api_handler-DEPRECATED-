"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkerOptions = exports.WaypointAction = exports.ErrorCode = exports.nullID = exports.api_version = void 0;
// |  /!\ This must be incrimented each meaningful change to the protocol.
// | 
// |  TODO: Version is incrimented manually for now, but in the future we should use formal versioning.
// |  https://gitversion.readthedocs.io/en/latest/input/docs/configuration/
exports.api_version = 4.0;
exports.nullID = "";
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["success"] = 0] = "success";
    ErrorCode[ErrorCode["unknown_error"] = 1] = "unknown_error";
    ErrorCode[ErrorCode["invalid_id"] = 2] = "invalid_id";
    ErrorCode[ErrorCode["invalid_secret_id"] = 3] = "invalid_secret_id";
    ErrorCode[ErrorCode["denied_group_access"] = 4] = "denied_group_access";
    ErrorCode[ErrorCode["missing_data"] = 5] = "missing_data";
    ErrorCode[ErrorCode["no_op"] = 6] = "no_op";
    // ... add more as needed
})(ErrorCode = exports.ErrorCode || (exports.ErrorCode = {}));
var WaypointAction;
(function (WaypointAction) {
    WaypointAction[WaypointAction["none"] = 0] = "none";
    WaypointAction[WaypointAction["new"] = 1] = "new";
    WaypointAction[WaypointAction["modify"] = 2] = "modify";
    WaypointAction[WaypointAction["delete"] = 3] = "delete";
    WaypointAction[WaypointAction["sort"] = 4] = "sort";
})(WaypointAction = exports.WaypointAction || (exports.WaypointAction = {}));
exports.MarkerOptions = [
    "circle",
    "square",
    "plus",
    "minus",
    "plane-departure",
    "plane-arrival",
    "plane",
    "parachute-box",
    "exclamation",
    "question",
    "broadcast-tower",
    "gas-pump",
];
