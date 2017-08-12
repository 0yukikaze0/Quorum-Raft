/* +--------------------------------------------------------------+
 *  Quorum Network Composition Script v1.0
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
var shell           = require('shelljs');
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

/**
 * Entry method. Promise chained
 */
execute = () => {

    loadInventory()
        .then( ()           => inquire.prompt(questions))
        .then((answers)     => sanitize(answers))
        .then(()            => buildScaffolding())
        .then(()            => generateKeyPairs())
        .then(()            => mapNetworkListing())
}

loadInventory = () => {
    return new Promise( (resolve, reject) => {
        /**
         * Check if inventory.json exists
         *  -> If not create one
         *  -> Load contents into memory
         */
        if(!fs.existsSync(config.get('stagingRoot') + 'inventory.json')){
            console.log('|+- Unable to find inventory.json  -+|');
            console.log('|+- Creating default inventory     -+|');
            this._inventory = {};
            fs.writeFileSync(config.get('stagingRoot') + 'inventory.json',JSON.stringify(this._inventory));
        } else {
            this._inventory = JSON.parse(fs.readFileSync(config.get('stagingRoot') + 'inventory.json'));
            console.log('|+- Inventory Loaded               -+|');
        }
        resolve();
    })
    
}

/**
 * Sanitizes user input. Read internal comments for details
 * @return {Promise}
 */
sanitize = (answers) => {
    return new Promise( (resolve, reject) => {
        this._paramMap = answers;
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
        this._paramMap.uniqueId = uniqueNetworkId;
        if(this._paramMap.networkName == undefined || this._paramMap.networkName == null || this._paramMap.networkName.length == 0){
            this._paramMap.networkName = uniqueNetworkId;
            console.log(`           +- Network name not detected -> Injecting ${this._paramMap.networkName} as Network Name`)
        } 

        // [1b]
        this._paramMap.networkName = this._paramMap.networkName.replace(/ /g,'_');

        // [2]
        console.log('   [X] - Checking node count');
        this._paramMap.nodeCount = parseInt(this._paramMap.nodeCount);
        let maxNodeCount = config.get('constraints.maxNodeCount');
        if(isNaN(this._paramMap.nodeCount) || this._paramMap.nodeCount == 0){
            this._paramMap.nodeCount = config.get('defaults.nodeCount');
            console.log(`           +- Invalid node count. Defaulting to ${this._paramMap.nodeCount}`);
        }
        if(this._paramMap.nodeCount > maxNodeCount){
            console.log(`           +- Chosen node count ${this._paramMap.nodeCount} exceeds max cap of ${maxNodeCount}. Capping to ${maxNodeCount}`);
            this._paramMap.nodeCount = maxNodeCount;
        }

        resolve(this._paramMap);
    })
}

/**
 * Builds folder structure needed to house network assets and components
 * @return {Promise}
 */
buildScaffolding = () => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Creating scaffolding');
        console.log('   [x] - Creating folders');
        let stagingDir = config.get('stagingRoot') + this._paramMap.networkName;
        this._paramMap.stagingDir = stagingDir;
        fs.mkdirSync(stagingDir);
        for(candidate in scaffolding) {
            fs.mkdirSync(stagingDir + scaffolding[candidate]);
        }
        resolve(this._paramMap);
    })
}

/**
 * Builds key pairs for quorum accounts and quorum nodes
 * @return {Promise}
 */
generateKeyPairs = () => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Generating Keys');
        console.log('   [x] - Generating node keys')
        for (let i = 1; i <= this._paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            console.log(`       +- ${nodeName}`);
            let nodeKeyPair = quorumKeygen.generateNodeKeys();
            fs.writeFileSync(this._paramMap.stagingDir + scaffolding.nodeKeys + nodeName + 'keypair.json', JSON.stringify(nodeKeyPair));
            fs.writeFileSync(this._paramMap.stagingDir + scaffolding.nodeKeys + nodeName, nodeKeyPair.privateKey);
        }

        console.log('   [x] - Generating account key pairs');
        for (let i = 1; i <= this._paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            console.log(`       +- ${nodeName}`);
            let keyPair = quorumKeygen.createNewAccount(nodeName);
            fs.writeFileSync(this._paramMap.stagingDir + scaffolding.keys + nodeName , JSON.stringify(keyPair));
        }
        resolve(this._paramMap);
    })
    
}

/**
 * Maps current network composition into an index file for future reference
 * - For compatibility, store metadata into the same folder
 */
mapNetworkListing = () => {
    return new Promise( (resolve, reject) => {
        this._inventory[this._paramMap.networkName] = {
            nodeCount   : this._paramMap.nodeCount,
            stagingDir  : this._paramMap.stagingDir,
            uniqueId    : this._paramMap.uniqueId
        }
        fs.writeFileSync(config.get('stagingRoot') + 'inventory.json', JSON.stringify(this._inventory, null, 4));
        console.log('');
        console.log(' > Inventory Updated');
        console.log('+-----------------------------------+');
    })
    
}

execute();