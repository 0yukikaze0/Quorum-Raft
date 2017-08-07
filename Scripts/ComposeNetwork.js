/* +--------------------------------------------------------------+
 *  Quorum Network composition script v1.0
 *  Author : Ashfaq Ahmed Shaik
 * 
 *  This interactive script allows users to compose a quorum network
 *  with fixed number of nodes.
 * 
 *  This script helps in creating
 *  +- Scaffolding for network
 *  +- Node keypars
 *  +  Default account keypairs
 * +--------------------------------------------------------------+*/

var fs              = require('fs');
var config          = require('config');
var crypto          = require('crypto');
var inquire         = require('inquirer');
var quorumKeygen    = require('quorum-keygen');

/*--------------------------------------------------------------*
 * Prompts
 *--------------------------------------------------------------*/
let questions = [
    {
        type: 'input',
        name: 'networkName',
        message : 'Enter network name :'
    },
    {
        type: 'input',
        name: 'nodeCount',
        message : 'Enter number of nodes :'
    }
]
/*--------------------------------------------------------------*/

/*--------------------------------------------------------------*
 * Scaffolding Folders
 *--------------------------------------------------------------*/
let scaffolding = {
    'keys'                  : '/keys/',
    'nodeKeys'              : '/nodeKeys/',
    'constellation'         : '/constellation/',
    'constellationConfigs'  : '/constellation/Configs/',
    'constellationKeys'     : '/constellation/keys/'
}
/*--------------------------------------------------------------*/

prompt = () => {

    inquire.prompt(questions)
        .then((answers)     => sanitize(answers))
        .then((paramMap)    => buildScaffolding(paramMap))
        .then((paramMap)    => generateKeyPairs(paramMap))

}

sanitize = (paramMap) => {
    return new Promise( (resolve, reject) => {
        console.log('+-----------------------------------+');
        console.log(' > Validating network config');

        /**
         * [1] -> Sanitize Network Name
         *      [1a] -> If no network name is specified, inject a random string
         *      [1b] -> Replace all spaces in network name with _
         * [2] -> Cap the node count to constraint constraints.maxNodeCount
         */

        // [1a]
        console.log('   [X] - Sanitizing network name');
        let uniqueNetworkId = crypto.randomBytes(8).toString('hex');
        paramMap.uniqueId = uniqueNetworkId;
        if(paramMap.networkName == undefined || paramMap.networkName == null || paramMap.networkName.length == 0){
            paramMap.networkName = uniqueNetworkId;
            console.log(`           +- Network name not detected -> Injecting ${paramMap.networkName} as Network Name`)
        } 

        // [1b]
        paramMap.networkName = paramMap.networkName.replace(/ /g,'_');

        // [2]
        console.log('   [X] - Checking node count');
        paramMap.nodeCount = parseInt(paramMap.nodeCount);
        let maxNodeCount = config.get('constraints.maxNodeCount');
        if(isNaN(paramMap.nodeCount) || paramMap.nodeCount == 0){
            paramMap.nodeCount = config.get('defaults.nodeCount');
            console.log(`           +- Invalid node count. Defaulting to ${paramMap.nodeCount}`);
        }
        if(paramMap.nodeCount > maxNodeCount){
            console.log(`           +- Chosen node count ${paramMap.nodeCount} exceeds max cap of ${maxNodeCount}. Capping to ${maxNodeCount}`);
            paramMap.nodeCount = maxNodeCount;
        }

        resolve(paramMap);
    })
}

buildScaffolding = (paramMap) => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Creating scaffolding');
        console.log('   [x] - Creating folders');
        let stagingDir = config.get('stagingRoot') + paramMap.networkName + '_' + paramMap.uniqueId;
        paramMap.stagingDir = stagingDir;
        fs.mkdirSync(stagingDir);
        for(candidate in scaffolding) {
            fs.mkdirSync(stagingDir + scaffolding[candidate]);
        }
        resolve(paramMap);
    })
}

generateKeyPairs = (paramMap) => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Generating Keys');
        console.log('   [x] - Generating node keys')
        for (let i = 1; i <= paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            console.log(`       +- ${nodeName}`);
            let nodeKeyPair = quorumKeygen.generateNodeKeys();
            fs.writeFileSync(paramMap.stagingDir + scaffolding.nodeKeys + nodeName + 'keypair.json', JSON.stringify(nodeKeyPair));
            fs.writeFileSync(paramMap.stagingDir + scaffolding.nodeKeys + nodeName, nodeKeyPair.privateKey);
        }

        console.log('   [x] - Generating account key pairs');
        for (let i = 1; i <= paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            console.log(`       +- ${nodeName}`);
            let keyPair = quorumKeygen.createNewAccount(nodeName);
            fs.writeFileSync(paramMap.stagingDir + scaffolding.keys + nodeName , JSON.stringify(keyPair));
        }
       console.log('+-----------------------------------+');
    })
    
}

prompt();