/* +--------------------------------------------------------------+
 *  Quorum Network Boot Script v1.0
 *  Author : Ashfaq Ahmed Shaik
 * 
 *  Starts quorum containers in raft mode
 * +--------------------------------------------------------------+*/
var fs              = require('fs');
var shell           = require('shelljs');
var config          = require('config');
var child_process   = require('child_process');

/**
 * Entry method. Promise chained
 */
execute = () => {
    validateNetworkTemplate()
        .then(()        => loadNetworkMeta())
        .then(()        => bootConstellationNodes())
        .then(()        => bootGethNodes());
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
 * Boots constellation-node process on all containers
 * @return {Promise}
 */
bootConstellationNodes = () => {
    return new Promise( (resolve, reject) => {
        console.log('   [*]- Booting constellation Nodes');
        this._paramMap.nodes.forEach((nodeName) => {
            console.log(`       +- Booting constellation on ${nodeName}`);
            child_process.spawnSync('docker', [ 'exec', '-d', 
                                    `${this._paramMap.networkName}_${nodeName}`, '/bin/bash', '-c',
                                    `nohup constellation-node /data/quorum/constellation/${nodeName}_constellation.conf 2>> /data/quorum/logs/${nodeName}_constellation.log &`], {
                    stdio: 'inherit'
            });
        }, this);
        resolve();
    })
}

/**
 * Runs geth process on all containers
 * @return {Promise}
 */
bootGethNodes = () => {
    return new Promise( (resolve, reject) => {
        /**
         * Run directive
         * PRIVATE_CONFIG=${nodeName}_constellation.conf nohup geth --datadir /data/quorum ${globalArgs} --rpcport 30301 --port 30303 2>>/data/quorum/logs/${nodeName}_constellation.log
         */
        let globalArgs = '--raft --rpc --rpcaddr 0.0.0.0 --rpcapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,quorum';
        console.log('   [*]- Starting Geth Nodes');
        this._paramMap.nodes.forEach((nodeName) => {
            console.log(`       +- Booting geth on ${nodeName}`);
            child_process.spawnSync('docker', [ 'exec', '-d', 
                                    `${this._paramMap.networkName}_${nodeName}`, '/bin/bash', '-c',
                                    `nohup constellation-node /data/quorum/constellation/${nodeName}_constellation.conf 2>> /data/quorum/logs/${nodeName}_constellation.log &`], {
                    stdio: 'inherit'
            });
        }, this);
        resolve();
    })
}

execute();