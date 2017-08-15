/* +--------------------------------------------------------------+
 *  Quorum Network Stop Script v1.0
 *  Author : Ashfaq Ahmed Shaik
 * 
 *  Starts quorum containers in raft mode
 * +--------------------------------------------------------------+*/
var fs              = require('fs');
var shell           = require('shelljs');
var config          = require('config');

/**
 * Entry method. Promise chained
 */
execute = () => {
    console.log('+---------------------------------------------------+');
    console.log('|        Quorum Network Stop Sequence               |')
    console.log('+---------------------------------------------------+');
    validateNetworkTemplate()
        .then(()        => loadNetworkMeta())
        .then(()        => stopContainers())
}

validateNetworkTemplate = () => {
    return new Promise( (resolve, reject) => {
        let args = process.argv.slice(2);
        
            if(args.length == 0){
                console.log('Network name not detected');
                console.log('USAGE : node StopNetwork.js <network name>');
                process.exit();
            }
        
            this._paramMap = {networkName:args[0]};
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
        // Load node ip addresses
        this._addresses = JSON.parse(fs.readFileSync(`${config.get('volumeMountRoot')}${this._paramMap.networkName}/addresses.json`));
        console.log('   [*]- Loaded network meta');
        resolve();
    });
}

stopContainers = () => {
    return new Promise( (resolve, reject) => {
        console.log('   [*]- Issuing stop instruction to all containers')
        this._paramMap.nodes.forEach(function(nodeName) {
            let containerName = `${this._paramMap.networkName}_${nodeName}`;
            console.log(`       +- Stopping ${containerName}`);
            shell.exec(`docker stop ${containerName}`,{silent:true});
        }, this);
        console.log('   [*]- Stop sequence completed')
        console.log('+---------------------------------------------------+');
    });
}

execute();