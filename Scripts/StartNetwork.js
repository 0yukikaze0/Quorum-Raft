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

bootConstellationNodes = () => {

}

bootGethNodes = () => {

}

execute();