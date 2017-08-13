/* +--------------------------------------------------------------+
 *  Quorum Genesis File creator v1.0
 *  Author : Ashfaq Ahmed Shaik
 *  
 *  Scans through a network template and generates a genesis JSON
 *
 *  USAGE : node ComposeGenesis.js <network name>
 * +--------------------------------------------------------------+*/
var fs  = require('fs');

buildGenesis = () => {

    let stub = {
        "coinbase": "0x0000000000000000000000000000000000000000",
        "config": {
          "homesteadBlock": 0
        },
        "difficulty": "0x0",
        "extraData": "0x",
        "gasLimit": "0x2FEFD800",
        "mixhash": "0x00000000000000000000000000000000000000647572616c65787365646c6578",
        "nonce": "0x0",
        "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "timestamp": "0x00"
    }


    let args = process.argv.slice(2);

    if(args.length == 0){
        console.log('Usage : node ComposeGenesis.js <Network Name>');
        process.exit();
    }

    /**
     * Check for network templates existence
     */
    let templateExists = fs.existsSync('./Networks/' + args[0]);

    if(!templateExists){
        console.log(`Failed to find network template '${args[0]}' in Networks folder`);
        process.exit();
    }
    
    /**
     * Get all keys and place them in an array
     */
    let keyFiles = fs.readdirSync(`./Networks/${args[0]}/keys`);
    
    stub.alloc = {};
    keyFiles.forEach(function(keyFile) {
        let fileData = fs.readFileSync(`./Networks/${args[0]}/keys/${keyFile}`,'utf8');
        let obj = JSON.parse(fileData);
        stub.alloc[`0x${obj.address}`] = {"balance": "1000000000000000000000000000"}        
    }, this);
    
    fs.writeFileSync(`./Networks/${args[0]}/genesis.json`, JSON.stringify(stub,null,4));

}

buildGenesis();