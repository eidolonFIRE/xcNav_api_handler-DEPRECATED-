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
    lambdaActions.action("joinGroupRequest", Actions.joinGroupRequest);
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
