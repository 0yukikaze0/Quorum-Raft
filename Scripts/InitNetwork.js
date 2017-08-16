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
        .then(()        => mapAddresses())
        .then(()        => writeStaticNodes())
        .then(()        => writePermissioning())
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
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/geth/nodekey`);
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
 * TODO : Optimize later
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
            let runDirective = null;
            let lastConstellationPort = 0;
            let portStart = parseInt(this._paramMap.portStart);

            if(this._paramMap.mapAllPorts || i == 0){

                if(lastConstellationPort == 0){
                    lastConstellationPort = portStart - 4;
                }
                let constellationPort = lastConstellationPort + 4;
                lastConstellationPort = constellationPort;
                let rpcPort = constellationPort + 1;
                let port = constellationPort + 3;
                let raftPort = port + 20000;
                
                runDirective =    `docker  run -td `
                                + ` --name ${this._paramMap.networkName}_${nodeName}`
                                + ` --network ${this._paramMap.networkName}`
                                + ` -v $HOME/quorum/networks/${this._paramMap.networkName}/genesis:/data/genesis`
                                + ` -v $HOME/quorum/networks/${this._paramMap.networkName}/datadirs/${nodeName}:/data/quorum`
                                + ` -p ${constellationPort}:30300`
                                + ` -p ${rpcPort}:30301`
                                + ` -p ${port}:30303`
                                + ` -p ${raftPort}:50303`
                                + ` ${config.get('containerConfig.imageName')} > /dev/null`;

            } else {
                runDirective =    `docker  run -td `
                                + ` --name ${this._paramMap.networkName}_${nodeName}`
                                + ` --network ${this._paramMap.networkName}`
                                + ` -v $HOME/quorum/networks/${this._paramMap.networkName}/genesis:/data/genesis`
                                + ` -v $HOME/quorum/networks/${this._paramMap.networkName}/datadirs/${nodeName}:/data/quorum`
                                + ` -p 30300`
                                + ` -p 30301`
                                + ` -p 30303`
                                + ` -p 50303`
                                + ` ${config.get('containerConfig.imageName')} > /dev/null`;
            }

        
            console.log(`       +- Launching ${nodeName}`);
            shell.exec(runDirective,{silent:true});
        }
        resolve();
    });
}

/**
 * Extracts info on containers IP addresses and maps them to enode addresses
 * @return {Promise}
 */
mapAddresses = () => {
    return new Promise( (resolve, reject) => {
        /**
         * Call docker inspect on each container to get its network config
         * docker inspect --format "{{ .NetworkSettings.Networks.$networkName.IPAddress }}" ${containerName}
         */
        this._containerAddresses = {};
        this._paramMap.nodes.forEach(function(nodeName) {
            
            let containerName = `${this._paramMap.networkName}_${nodeName}`;
            let ipAddress = shell.exec(`docker inspect --format "{{ .NetworkSettings.Networks.${this._paramMap.networkName}.IPAddress }}" ${containerName}`,{silent:true}).stdout;
            this._containerAddresses[containerName] = {
                ipAddress   : ipAddress.trim(),
                enode       : `enode://${this._paramMap.nodeAddresses[nodeName]}@${ipAddress.trim()}:30303?discport=0` 
            }
        }, this);
        fs.writeFileSync(`${config.get('volumeMountRoot')}${this._paramMap.networkName}/addresses.json`, JSON.stringify(this._containerAddresses, null, 4))
        resolve();
    });
}

/**
 * Writes static-nodes.json
 */
writeStaticNodes = () => {
    return new Promise( (resolve, reject) => {
        console.log('   [*]- Creating static-nodes.json');
        let enodes = [];
        this._paramMap.nodes.forEach(function(nodeName) {
            enodes.push(this._containerAddresses[`${this._paramMap.networkName}_${nodeName}`].enode);
        }, this);

        /**
         * Add any external enode mentions from external-static-nodes.json
         */
        if(fs.existsSync(`${config.get('stagingRoot')}${this._paramMap.networkName}/external-static-nodes.json`)){
            let externalNodes = JSON.parse(fs.readFileSync(`${config.get('stagingRoot')}${this._paramMap.networkName}/external-static-nodes.json`));
            console.log(`       +- Found ${externalNodes.length} nodes in external-static-nodes.json`);
            console.log(`       +- Adding as RAFT participants`);
            externalNodes.forEach(function(externalNode) {
                enodes.push(externalNode);
            }, this);
        }
        
        fs.writeFileSync(`${config.get('volumeMountRoot')}${this._paramMap.networkName}/static-nodes.json`, JSON.stringify(enodes, null, 4));
        resolve();
    });
}

/**
 * Creates a permissioned-nodes json file
 */
writePermissioning = () => {
    return new Promise( (resolve, reject) => {
        console.log('   [*]- Creating permissioned-nodes.json');
        let enodes = [];
        this._paramMap.nodes.forEach(function(nodeName) {
            enodes.push(this._containerAddresses[`${this._paramMap.networkName}_${nodeName}`].enode);
        }, this);
        
        /**
         * Add any external enode mentions from external-permissioned-nodes.json
         */
        if(fs.existsSync(`${config.get('stagingRoot')}${this._paramMap.networkName}/external-permissioned-nodes.json`)){
            let externalNodes = JSON.parse(fs.readFileSync(`${config.get('stagingRoot')}${this._paramMap.networkName}/external-permissioned-nodes.json`));
            console.log(`       +- Found ${externalNodes.length} nodes in external-permissioned-nodes.json`);
            console.log(`       +- Adding to permissioning`);
            externalNodes.forEach(function(externalNode) {
                enodes.push(externalNode);
            }, this);
        }

        fs.writeFileSync(`${config.get('volumeMountRoot')}${this._paramMap.networkName}/permissioned-nodes.json`, JSON.stringify(enodes, null, 4));
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
         * Start geth on all containers
         */
        console.log('   [*]- Initializing geth Nodes');
        this._paramMap.nodes.forEach(function(nodeName) {
            console.log(`       +- Booting geth on ${nodeName}`);
            /**
             * Copy static-nodes & permissioned-nodes
             */
            shell.cp(   `${config.get('volumeMountRoot')}${this._paramMap.networkName}/static-nodes.json`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/`);
            shell.cp(   `${config.get('volumeMountRoot')}${this._paramMap.networkName}/permissioned-nodes.json`,
                        `${config.get('volumeMountRoot')}${this._paramMap.networkName}/datadirs/${nodeName}/`);

            child_process.spawnSync('docker', [ 'exec',  
                                                `${this._paramMap.networkName}_${nodeName}`, 
                                                'geth', '--datadir', 
                                                `/data/quorum/`,'init', 
                                                '/data/genesis/genesis.json'], {stdio: 'inherit'});
        }, this);
        resolve();
    });
}

execute();