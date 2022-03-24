// // const axios = require('axios')
// // const url = 'http://checkip.amazonaws.com/';
// let response;

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

import { LambdaActions } from 'lambda-actions';
import * as Actions from './actions';
import { config } from 'aws-sdk';

config.update({region: "us-west-1"});



export const lambdaHandler = async (event, context) => {
  
  

  if (!event.requestContext) {
    return {};
  }

  console.log("Event: ", event);

  try {

    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    const body = JSON.parse(event.body || '{}');

    const lambdaActions = new LambdaActions();
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
    lambdaActions.action("pilotsStatusRequest", Actions.pilotsStatusRequest);
    lambdaActions.action("flightPlanSync", Actions.flightPlanSync);
    lambdaActions.action("flightPlanUpdate", Actions.flightPlanUpdate);
    lambdaActions.action("pilotSelectedWaypoint", Actions.pilotSelectedWaypoint);

    await lambdaActions.fire({
      action: routeKey,
      payload: body["body"],
      meta: connectionId,
    });

  } catch (err) {
    console.error(err);
  }

  return {};
};
