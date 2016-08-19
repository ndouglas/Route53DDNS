#!/usr/bin/env node

/**
 * Author: Nathan Douglas
 * Requirements: Node installed
 * Installation: npm install public-ip aws-sdk
 * Run: node Route53DDNS.js access_key secret_access_key hosted_zone_id domain.name [region]
 * Date: 20160812
 */

// Dependencies
var publicIP = require('public-ip');
var fs = require('fs');
var AWS = require('aws-sdk');
var exec = require('child_process').exec;
var isIP = require('is-ip');

// Parse command line arguments.
var ACCESS_KEY_ID = process.argv[2];
var ACCESS_KEY_SECRET = process.argv[3];
var HOSTED_ZONE_ID = process.argv[4];
var DOMAIN_NAME = process.argv[5];
var REGION = process.argv[6] || "us-east-1";

// Encode domain name.
var encodeDomainName = function (domainName) {
  return domainName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

// Filename for domain name.
var filenameForDomainName = function (domainName) {
  return encodeDomainName(domainName) + ".txt";
};

// Log some message.
var logMessage = function (message) {
  console.log("Error: " + message);
};

// Get the current public IP
var getCurrentIP = function (handler) {
  publicIP(function (error, currentIP) {
    if (error) {
      logMessage(error);
    } else if (!isIP(currentIP)) {
      logMessage("Invalid IP address: " + currentIP);
    } else {
      handler(currentIP);
    }
  });
};

// Get the previous IP from a file.
var getPreviousIPFromFile = function (filename, handler) {
  fs.stat(filename, function (error, status) {
    if (error && error.code === 'ENOENT') {
      putCurrentIPInFile(filename, '', function () {
        getPreviousIPFromFile(filename, handler);
      });
    } else if (error) {
      logMessage(error);
    } else {
      fs.readFile(filename, 'utf8', function (error, data) {
        if (error) {
          logMessage(error);
        } else if (!data) {
          putCurrentIPInFile(filename, '', function () {
            handler('');
          }); 
        } else {
          previousIP = data;
          handler(previousIP);
        }
      });
    }
  });
};

// Write the current IP to a file.
var putCurrentIPInFile = function (filename, currentIP, handler) {
  fs.writeFile(filename, currentIP, function (error) {
    if (error) {
      logMessage(error);
    } else {
      handler();
    }
  });
};

// Compare IPs and update if necessary.
var updateRoute53 = function (previousIP, currentIP) {
  if (currentIP) {
    if (previousIP !== currentIP) {
      var route53 = new AWS.Route53();
      var params = {
        "HostedZoneId" : HOSTED_ZONE_ID,
        "ChangeBatch" : {
          "Changes" : [
            {
              "Action" : 'UPSERT',
              "ResourceRecordSet" : {
                "Name" : DOMAIN_NAME,
                "Type" : 'A',
                "TTL" : 300,
                "ResourceRecords" : [
                  {
                    "Value" : currentIP
                  }
                ]
              }
            }
          ]
        }
      };
      route53.changeResourceRecordSets(params, function (error, data) {
        if (error) {
          logMessage("Error updating Route 53: " + error.code + "/" + error.statusCode + ".");
          logMessage(error.stack, true);
        } else {
          putCurrentIPInFile(filenameForDomainName(DOMAIN_NAME), currentIP, function () {
            logMessage("Route53 successfully updated.");
          });
        }
      });
    }
  } else {
    logMessage("No current IP provided.");
  }
};

// Update AWS configuration.
AWS.config.update({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: ACCESS_KEY_SECRET
});
AWS.config.update({region: REGION});

// Check command line arguments.
if (!ACCESS_KEY_ID) {
  logMessage("Did not provide ACCESS_KEY_ID!");
} else if (!ACCESS_KEY_SECRET) {
  logMessage("Did not provide ACCESS_KEY_SECRET!");
} else if (!HOSTED_ZONE_ID) {
  logMessage("Did not provide HOSTED_ZONE_ID!");
} else if (!DOMAIN_NAME) {
  logMessage("Did not provide DOMAIN_NAME!");
} else {
  getCurrentIP(function (currentIP) {
    getPreviousIPFromFile(filenameForDomainName(DOMAIN_NAME), function (previousIP) {
        updateRoute53(previousIP, currentIP);
    });
  });
}

