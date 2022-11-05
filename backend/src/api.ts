// |  /!\ This must be incrimented each meaningful change to the protocol.
// | 
// |  TODO: Version is incrimented manually for now, but in the future we should use formal versioning.
// |  https://gitversion.readthedocs.io/en/latest/input/docs/configuration/
export const api_version = 6.0;



// ############################################################################ 
//
//     Primative Types
//
// ############################################################################

// UTC time since Unix epoch in milliseconds
export type Timestamp = number;

export interface Duration {
    start: Timestamp
    end: Timestamp
}

export interface Telemetry {
    gps: any
    fuel: number      // Liters
    fuel_rate: number // L/hr
}

export type ID = string;
export const nullID = "";


export interface PilotMeta {
    id: ID
    name: string
    avatar_hash: string
    tier?: string
}

export interface Waypoint {
    id: ID
    name: string
    latlng: number[][]
    icon?: string
    color?: number
    length?: number
}

export type WaypointsData = Record<ID, Waypoint>;

export enum ErrorCode {
    success = 0,
    unknown_error = 1,
    invalid_id,             // invalid "pilot_id" or "group"
    invalid_secret_id,
    denied_group_access,    // IE. making requests for a group you aren't in
    missing_data,           // essential message data was left null
    no_op,                  // No change / Nothing to do (example: leaving group when you aren't in a group)
    // ... add more as needed
}

export enum WaypointAction {
    none = 0,
    update,
    delete,
}


// ############################################################################ 
//
//     Bi-directional
//
// ############################################################################

export interface ChatMessage {
    timestamp: Timestamp
    group: ID // target group
    pilot_id: ID // sender
    text: string
    emergency: boolean
}

export interface PilotTelemetry {
    timestamp: Timestamp
    pilot_id: ID
    telemetry: Telemetry
}

export interface NewMapLayer {
    owner: ID    // author pilot_id
    name: string
    data: string // json kml
}

export interface RemoveMapLayer {
    owner: ID
    name: string
}

// full sync of waypoints  data
export interface WaypointsSync {
    timestamp: Timestamp
    waypoints: WaypointsData
}

// update an individual waypoint
export interface WaypointsUpdate {
    timestamp: Timestamp
    hash: string
    action: WaypointAction
    waypoint: Waypoint
}

export type PilotWaypointSelections = Record<ID, ID>;

export interface PilotSelectedWaypoint {
    pilot_id: ID
    waypoint_id: ID
}



// ############################################################################ 
//
//     Server Notifications
//
// ############################################################################
export interface PilotJoinedGroup {
    pilot: PilotMeta
}

export interface PilotLeftGroup {
    pilot_id: ID
    new_group: ID
}



// ############################################################################ 
//
//     Server Requests 
//
// ############################################################################

// ============================================================================
// Client request to authenticate. If client already holds a secret_id, this is how to
// request access to the server API, authenticating the client. When client doesn't yet hold
// a valid secret_id, this is how to have one issued by the server.
//
// - If pilot is not yet registered with this server, request will fail.
// ----------------------------------------------------------------------------
export interface AuthRequest {
    secret_id: ID
    pilot: PilotMeta
    group: ID
    tier_hash?: string
    api_version?: number
}

export interface AuthResponse {
    status: ErrorCode
    secret_id: ID  // private key
    pilot_id: ID   // public key
    pilot_meta_hash: string
    api_version: number
    group: ID
    tier?: string
}

// ============================================================================
// Client request update user information.
// ----------------------------------------------------------------------------
export interface UpdateProfileRequest {
    pilot: PilotMeta
    secret_id: ID
}

export interface UpdateProfileResponse {
    status: ErrorCode
}


// ============================================================================
// Client request information on a group.
// ----------------------------------------------------------------------------
export interface GroupInfoRequest {
    group: ID
}

export interface GroupInfoResponse {
    status: ErrorCode
    group: ID
    pilots: PilotMeta[]
    waypoints: WaypointsData
    selections: PilotWaypointSelections
}

// ============================================================================
// Client request to join a group
//
// ----------------------------------------------------------------------------
export interface JoinGroupRequest {
    group: ID
}

export interface JoinGroupResponse {
    status: ErrorCode
    group: ID
}

// ============================================================================
// Client request to leave current group
//
// - prompt_split: Notify the whole group of a split and offer chance to join
//                 new contingent.
// ----------------------------------------------------------------------------
export interface LeaveGroupRequest {
    prompt_split: boolean
}

export interface LeaveGroupResponse {
    status: ErrorCode
    group: ID // new group user has created
}
