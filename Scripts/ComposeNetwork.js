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
var handleBars      = require('handlebars');
var quorumKeygen    = require('quorum-keygen');
var child_process   = require('child_process');

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
    },
    {
        type: 'input',
        name: 'portStart',
        message : 'Enter port number to start ranging from :'
    },
    {
        type: 'confirm',
        name: 'mapAllPorts',
        message : 'Map all ports to host ports',
        default : false
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
    'constellationConfigs'  : '/constellation/configs/',
    'constellationKeys'     : '/constellation/keys/'
}
/*--------------------------------------------------------------*/

/**
 * Entry method. Promise chained
 */
execute = () => {
    
    checkPrerequisites()
        .then(()            => loadInventory())    
        .then(()            => inquire.prompt(questions))
        .then((answers)     => sanitize(answers))
        .then(()            => buildScaffolding())
        .then(()            => generateKeyPairs())
        .then(()            => startStagingContainer())
        .then(()            => generateConstellationKeys())
        .then(()            => generateConstellationConfigs())
        .then(()            => generateGenesisFile())
        .then(()            => mapNetworkListing())
}

checkPrerequisites = () => {
    return new Promise( (resolve, reject) => {
        let goFlag = true;
        
        let checkSubjects = config.get('prerequisites');
        
        checkSubjects.forEach(function(subject) {
            if(!shell.which(subject)){
                console.log(`Unable to find ${subject}. Please install ${subject} and run composer again.`);
                goFlag = false;
            }
        }, this);
        
        if(goFlag){
            resolve();
        } else {
            process.exit();
        }    
    }); 
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
        this._paramMap.nodes = [];
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
        this._paramMap.nodeAddresses = {};
        console.log('');
        console.log(' > Generating Keys');
        console.log('   [x] - Generating node keypairs')
        for (let i = 1; i <= this._paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            console.log(`       +- ${nodeName}`);
            let nodeKeyPair = quorumKeygen.generateNodeKeys();
            this._paramMap.nodeAddresses[nodeName] = nodeKeyPair.publicKey;
            fs.writeFileSync(this._paramMap.stagingDir + scaffolding.nodeKeys + nodeName + '_keypair.json', JSON.stringify(nodeKeyPair));
            fs.writeFileSync(this._paramMap.stagingDir + scaffolding.nodeKeys + nodeName + '_nodeKey', nodeKeyPair.privateKey);
        }

        console.log('   [x] - Generating account key pairs');
        for (let i = 1; i <= this._paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            this._paramMap.nodes.push(nodeName);
            console.log(`       +- ${nodeName}`);
            let keyPair = quorumKeygen.createNewAccount(nodeName);
            fs.writeFileSync(this._paramMap.stagingDir + scaffolding.keys + nodeName + '_account' , JSON.stringify(keyPair));
        }
        resolve(this._paramMap);
    })
    
}

startStagingContainer = () => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Starting staging Container');
        let containerConfig = config.get('containerConfig');
        let stagingTemplate = null;
        let stagingDirective = null;
        
        /**
         * Stop and remove any stale staging containers
         */
        console.log('   [x] - Detecting & removing stale container...');
        stagingTemplate = handleBars.compile(config.get('directives.removeStaleContainer'));
        stagingDirective = stagingTemplate(containerConfig);
        shell.exec(stagingDirective,{silent:true});
        /**
         * Run a new container instance
         *  +- Mount ./Networks/<networkName/constellation/keys/> to /data
         */
        containerConfig.hostMount = `${this._paramMap.stagingDir}/constellation/keys`;
        console.log('   [x] - Initializing stage container...');
        stagingTemplate = handleBars.compile(config.get('directives.initStagingContainer'));
        stagingDirective = stagingTemplate(containerConfig);
                
        shell.exec(stagingDirective);

        /** 
         * Check if our run directive was successful
         */
        let chkSts = `docker inspect --format "{{ .State.Status }}" ${containerConfig.stagingName}`;
        let status = shell.exec(chkSts,{silent:true}).stdout;
        console.log(`   [x] - Container status : ${status}`);
        if(status.trim() === 'running'){
            resolve();
        } else {
            console.log('Failed to initialize staging container to create constellation key pairs');
            process.exit();
        }
        
    });
}

/**
 * Runs a docker command to generate constellation key pair
 * @return {Promise}
 */
generateConstellationKeys = () => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Generating Constellation keypairs');
        let containerConfig = config.get('containerConfig');
        /** Generate constellation keys for all nodes */
        for (let i = 1; i <= this._paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            console.log(`       +- Generating constellation key pair for ${nodeName}`);
            containerConfig.nodeName = nodeName;
            
            child_process.spawnSync('docker', [ 'exec', '-it', containerConfig.stagingName, 'constellation-node', `--generatekeys=/data/${nodeName}_constellation` ], {
                stdio: 'inherit'
            });
        }
        shell.exec(`docker stop ${containerConfig.stagingName} && docker rm ${containerConfig.stagingName}`);
        resolve();
    });
}

/**
 * Generates config files for constellation
 * @return {Promise}
 */
generateConstellationConfigs = () => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Writing constellation configurations');
        for (let i = 1; i <= this._paramMap.nodeCount; i++) {
            let nodeName = 'Node' + i;
            let fileContent =     `url = "http://127.0.0.1:9000/" \n`
                                + `port = 9000 \n`
                                + `socket = "/data/quorum/constellation/${nodeName}_constellation.ipc" \n`
                                + `otherNodeUrls = [] \n`
                                + `publickeys = ["/data/quorum/constellation/keystore/${nodeName}_constellation.pub"] \n`
                                + `privatekeys = ["/data/quorum/constellation/keystore/${nodeName}_constellation.key"] \n`
                                + `storage = "/data/quorum/constellation/storage" \n`;
            fs.writeFileSync(`${this._paramMap.stagingDir}/constellation/configs/${nodeName}_constellation.conf`, fileContent );
        }
        resolve();
    });
}

/**
 * Calls external script to generate a genesis file based on current key pairs
 * @return {Promise}
 */
generateGenesisFile = () => {
    return new Promise( (resolve, reject) => {
        console.log('');
        console.log(' > Building genesis file');
        shell.exec(`node ./Scripts/ComposeGenesis.js ${this._paramMap.networkName}`);
        resolve();
    });
}

/**
 * Maps current network composition into an index file for future reference
 * - For compatibility, store metadata into the same folder
 * @return {Promise}
 */
mapNetworkListing = () => {
    return new Promise( (resolve, reject) => {

        /**
         * Write meta data
         */
        fs.writeFileSync(this._paramMap.stagingDir + '/' + 'meta.json', JSON.stringify(this._paramMap, null, 4));
        /**
         * Update inventory
         */
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