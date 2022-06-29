import { SSM } from 'aws-sdk';
import CryptoJS from 'crypto-js';
import { patreon } from 'patreon';

let servmgr = new SSM();

async function getKey() {
    const ssm_params1 = {
        Name: 'patreonKey',
        WithDecryption: true,
    };
    return servmgr.getParameter(ssm_params1).promise();
}



/// Table of hashed email+name to lookup pledged tier
export let userPledges = undefined


export async function pullPatreonTable() {
    console.log("KEY:", await (await getKey()).$response.data["secretKey"]);
    const patreonAPIClient = patreon(await (await getKey()).$response.data["secretKey"]);
    return patreonAPIClient('/campaigns/8686377/pledges')
        .then(({ store }) => {
            let userEmails = {}
            let userNames = {}
            const user = store.findAll('user').map(user => user.serialize())
            user.forEach(element => {
                userEmails[element.data.id] = element.data.attributes.email;
                userNames[element.data.id] = element.data.attributes.first_name;
            });
            // console.log("USERSEmails:", usersEmails)

            let rewards = {}
            const reward = store.findAll('reward').map(reward => reward.serialize())
            reward.forEach(element => {
                rewards[element.data.id] = element.data.attributes.title
            });
            // console.log("REWARDS:", rewards)

            let _userPledges = {}
            const pledge = store.findAll('pledge').map(pledge => pledge.serialize())
            pledge.forEach(element => {
                const id = element.data.relationships.patron.data.id;
                let key = CryptoJS.sha256(userEmails[id] + userNames[id]);
                _userPledges[key] = rewards[element.data.relationships.reward.data.id]
            })
            userPledges = _userPledges;

            // console.log("User pledges:", userPledges)
        })
        .catch(err => {
            console.error('error!', err)
        }).promise();
}

