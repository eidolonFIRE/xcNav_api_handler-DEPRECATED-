import { LambdaActions } from 'lambda-actions';
import * as Actions from './actions';
import { config } from 'aws-sdk';

config.update({ region: "us-west-1" });



async function lambdaHandler(event, context) {



  if (!event.requestContext) {
    return {};
  }

  try {
    const connectionId = event.requestContext.connectionId;
    // const connectionId = event.requestContext.extendedConnectionId
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
    lambdaActions.action("joinGroupRequest", Actions.joinGroupRequest);
    lambdaActions.action("waypointsSync", Actions.waypointsSync);
    lambdaActions.action("waypointsUpdate", Actions.waypointsUpdate);
    lambdaActions.action("pilotSelectedWaypoint", Actions.pilotSelectedWaypoint);

    await lambdaActions.fire({
      action: routeKey,
      payload: body["body"],
      meta: connectionId,
    });
  } catch (err) {
    console.log("Event: ", event);
    console.error(err);
  }

  return {};
};

global.handler = lambdaHandler
exports.handler = lambdaHandler
