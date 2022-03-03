"use strict";
// // const axios = require('axios')
// // const url = 'http://checkip.amazonaws.com/';
// let response;
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
exports.lambdaHandler = void 0;
// /**
//  *
//  * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
//  * @param {Object} event - API Gateway Lambda Proxy Input Format
//  *
//  * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
//  * @param {Object} context
//  *
//  * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
//  * @returns {Object} object - API Gateway Lambda Proxy Output Format
//  * 
//  */
// exports.lambdaHandler = async (event, context) => {
//     try {
//         // const ret = await axios(url);
//         response = {
//             'statusCode': 200,
//             'body': JSON.stringify({
//                 message: 'hello world',
//                 // location: ret.data.trim()
//             })
//         }
//     } catch (err) {
//         console.log(err);
//         return err;
//     }
//     return response
// };
const lambda_actions_1 = require("lambda-actions");
const Actions = require("./actions");
const lambdaHandler = (event, context) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Event: ", event);
    if (!event.requestContext) {
        return {};
    }
    try {
        const connectionId = event.requestContext.connectionId;
        const routeKey = event.requestContext.routeKey;
        const body = JSON.parse(event.body || '{}');
        const lambdaActions = new lambda_actions_1.LambdaActions();
        lambdaActions.action('$connect', Actions.$connect);
        lambdaActions.action('$disconnect', Actions.$disconnect);
        lambdaActions.action('$default', Actions.$default);
        lambdaActions.action('authRequest', Actions.authRequest);
        lambdaActions.action('updateProfile', Actions.updateProfileRequest);
        lambdaActions.action("chatMessage", Actions.chatMessage);
        lambdaActions.action("pilotTelemetry", Actions.pilotTelemetry);
        lambdaActions.action("groupInfoRequest", Actions.groupInfoRequest);
        lambdaActions.action("chatLogRequest", Actions.chatLogRequest);
        lambdaActions.action("joinGroupRequest", Actions.joinGroupRequest);
        lambdaActions.action("leaveGroupRequest", Actions.leaveGroupRequest);
        lambdaActions.action("pilotsStatusRequest", Actions.pilotsStatusRequest);
        yield lambdaActions.fire({
            action: routeKey,
            payload: body["body"],
            meta: connectionId,
        });
    }
    catch (err) {
        console.error(err);
    }
    return {};
});
exports.lambdaHandler = lambdaHandler;
