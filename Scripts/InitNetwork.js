/* +--------------------------------------------------------------+
 *  Quorum Network Initialization Script v1.0
 *  Author : Ashfaq Ahmed Shaik
 * 
 *  Builds docker containers and prepares selected network topology
 * +--------------------------------------------------------------+*/
var fs              = require('fs');
var shell           = require('shelljs');
var config          = require('config');
var child_process   = require('child_process');

var nodeScaffolding = {
    "geth"          : "geth",
    "keystore"      : "keystore",
    "constellation" : "constellation/keystore",
    "logs"          : "logs"
}

/**
 * Entry method. promise chained
 */
execute = () => {

    let args = process.argv.slice(2);

    if(args.length == 0){
        console.log('Network name not detected');
        console.log('USAGE : node InitNetwork.js <network name>');
        process.exit();
    }

    this._paramMap = {networkName:args[0]};

    validateNetworkTemplate()
        .then(()        => loadNetworkMeta())
        .then(()        => createNodeScaffolding())
        .then(()        => createDockerNetwork())
        .then(()        => launchContainers())
        .then(()        => initNetwork())
}

validateNetworkTemplate = () => {
    return new Promise( (resolve, reject) => {
        /**
         * Check if the requested network template exists
         *  -> If not exit process
         */
        if(fs.existsSync(`${config.get('stagingRoot')}${this._paramMap.networkName}`)){
            console.log(`   [*]- Found network template ${this._paramMap.networkName}`);
            resolve();
        } else {
            console.log(`   [!]- Failed to find network template ${this._paramMap.networkName}`);
            process.exit();
        }
    });
}

loadNetworkMeta = () => {
    return new Promise( (resolve, reject) => {
        this._paramMap = JSON.parse(fs.readFileSync(`${config.get('stagingRoot')}${this._paramMap.networkName}/meta.json`));
        console.log('   [*]- Loaded network meta');
        resolve();
    });
}

/**
 * Creates folder structure needed to house nodes datastore, keystore, logs etc
 * @return {Promise}
 */
createNodeScaffolding = () => {
    return new Promise( (resolve, reject) => {

        /**
         * Create folder structures
         */
        console.log('   [*]- Creating scaffolding');
        console.log('       +- Creating network folder');
        shell.mkdir('-p', `${config.get('volumeMountRoot')}${this._paramMap.networkName}`);
        shell.mkdir('-p', `${config.get('volumeMountRoot')}${this._paramMap.networkName}/genesis`);
        
        this._paramMap.nodes.forEach((nodeName) => {
            console.log(`       +- Creating scaffolding for ${nodeName}`);
            let folders = [];
            for(let subject in nodeScaffolding){                
                folders.push(`${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/${nodeScaffolding[subject]}`)
            }
            shell.mkdir('-p', folders);
        }, this);
        
        /**
         * Copy files into respective folders
         * [1] - Conpy genesis json
         * [2] - Copy Node key
         * [3] - Copy account keypair
         * [4] - Copy constellation configuration
         * [5] - Copy constellation keypair
         */
        // [1]
        console.log('   [*]- Copying files');
        console.log('       +- Copying genesis');
        shell.cp(`${config.get('stagingRoot')}${this._paramMap.networkName}/genesis.json`,`${config.get('volumeMountRoot')}${this._paramMap.networkName}/genesis/`);
        this._paramMap.nodes.forEach((nodeName) => {
            console.log(`       +- Copying files for ${nodeName}`);
            // [2]
            shell.cp(   `${config.get('stagingRoot')}${this._paramMap.networkName}/nodeKeys/*${nodeName}_*`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/geth/`);
            shell.mv(   `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/geth/${nodeName}_nodeKey`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/geth/nodeKey`);
            // [3]
            shell.cp(   `${config.get('stagingRoot')}${this._paramMap.networkName}/keys/*${nodeName}_*`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/keystore/`);
            // [4]
            shell.cp(   `${config.get('stagingRoot')}${this._paramMap.networkName}/constellation/configs/*${nodeName}_*`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/constellation/`);
            // [5]
            shell.cp(   `${config.get('stagingRoot')}${this._paramMap.networkName}/constellation/keys/*${nodeName}_*`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/constellation/keystore`);
        }, this);
        
        resolve();
    });
}

/**
 * Creates a docker bridge network
 * @return {Promise}
 */
createDockerNetwork = () => {
    return new Promise( (resolve, reject) => {
        console.log(`   [*]- Creating docker network ${this._paramMap.networkName}`);
        console.log('       +- Deleting any stale network by the same name');
        shell.exec(`docker network rm ${this._paramMap.networkName} > /dev/null`);
        console.log(`       +- Creating ${this._paramMap.networkName} ...`);
        shell.exec(`docker network create --driver=bridge ${this._paramMap.networkName} > /dev/null`);
        resolve();
    });
}

/**
 * Launches docker containers with proper volume mounts to host data directories
 * @return {Promise}
 */
launchContainers = () => {
    return new Promise( (resolve, reject) => {
        /**
         * Container name would be networkname_nodename
         */
        console.log('   [*]- Initializing containers');
        for (let i = 0; i < this._paramMap.nodes.length; i++) {
            let nodeName = this._paramMap.nodes[i];
            let portStart = parseInt(this._paramMap.portStart);
            let constellationPort = portStart + i;
            let rpcPort = constellationPort + this._paramMap.nodeCount;
            let raftPort = rpcPort + 20000;
            
            let runDirective =    `docker  run -td `
                                + ` --name ${this._paramMap.networkName}_${nodeName}`
                                + ` --network ${this._paramMap.networkName}`
                                + ` -v $HOME/quorum/networks/${this._paramMap.networkName}/genesis:/data/genesis`
                                + ` -v $HOME/quorum/networks/${this._paramMap.networkName}/datadirs/${nodeName}:/data/quorum`
                                + ` -p ${constellationPort}:${constellationPort}`
                                + ` -p ${rpcPort}:${rpcPort}`
                                + ` -p ${raftPort}:${raftPort}`
                                + ` ${config.get('containerConfig.imageName')} > /dev/null`;
        
            console.log(`       +- Launching ${nodeName}`);
            shell.exec(runDirective,{silent:true});
        }
        resolve();
    });
}

/**
 * Starts geth and constellation
 * @return {Promise}
 */
initNetwork = () => {
    return new Promise( (resolve, reject) => {
        /**
         * Start constellation on all containers
         */
        console.log('   [*]- Starting Constellation Nodes');
        this._paramMap.nodes.forEach(function(nodeName) {
            console.log(`       +- Booting constellation on ${nodeName}`);
            child_process.spawnSync('docker', [ 'exec', '-d', 
                                                `${this._paramMap.networkName}_${nodeName}`, '/bin/bash', '-c',
                                                `nohup constellation-node /data/quorum/constellation/${nodeName}_constellation.conf 2>> /data/quorum/logs/${nodeName}_constellation.log &`], {
                stdio: 'inherit'
            });
        }, this);
        
        /**
         * Start geth on all containers
         */
        console.log('   [*]- Starting geth Nodes');
        this._paramMap.nodes.forEach(function(nodeName) {
            console.log(`       +- Booting geth on ${nodeName}`);
            child_process.spawnSync('docker', [ 'exec',  
                                                `${this._paramMap.networkName}_${nodeName}`, 
                                                'geth', '--datadir', 
                                                `/data/quorum/`,'init', 
                                                '/data/genesis/genesis.json'], {
                stdio: 'inherit'
            });
        }, this);
        resolve();
    });
}

execute();