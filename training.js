'use strict'
const fs = require('fs');
const path = require('path');
const async = require('async');
const request = require('request');
const gm = require('gm');

// TODO: Replace TOKEN with your own Sighthound Cloud Token
const recoConfig = {
  TOKEN: 'qAnmDdemRjGHjH4CASDZZBWPbdYxZeccCg3f', 
  BASE_URL: 'https://dev.sighthoundapi.com/v1'
};

// Define a generic callback to be used for outputting responses and errors
function genericCallback(error, response, body) {
  if (!error && (response.statusCode == 200 || response.statusCode == 204)) {
    console.log(body, '\n');
  } else if (error) {
    console.log(error, '\n');
  } else {
    console.log(response.statusCode, body, '\n');
  }
}

// Create an array of the people we want to recognize. For this tutorial, the 
// person's name will be their Object ID, and it's also the folder name 
// containing their training images in the downloadable tutorial code zip file.
const people = ['CCM'];

function step1_UploadImages() {
  
  // Create a queue to manage calls made to the /image endpoint. This queue
  // sets a limit of 3 concurrent calls.
  const qImages = async.queue((item, callback) => {
    console.log('uploading objectId: ' + item.objectId + ' | imageId: ' +
                item.imageId + ' | path: ' + item.imageLocalPath + '\n');

    // Create a read stream for the image to be uploaded
    const imageFileStream = fs.createReadStream(item.imageLocalPath);

    // Define options used for the API request
    const requestOptions = {
      url: `${recoConfig.BASE_URL}/image/${item.imageId}`,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Access-Token': recoConfig.TOKEN
      },
      method: 'PUT',
      qs: {
        objectId: item.objectId,
        objectType: 'person',
        train: 'manual'
      }
    };

    // Pipe the image stream into the request with the options and callback
    imageFileStream.pipe(request(requestOptions, callback));
  }, 3);

  // For each person, get list of images in their folder and add to upload queue.
  // The objectId will be the person's name and the imageId will be the filename.
  people.forEach((name) => {
    const trainingDir = path.join(__dirname,'uploads','training',name);
    console.log('Scanning for input files in ', trainingDir);

    fs.readdir(trainingDir, (err, files) => {
      console.log(`Uploading ${files.length} files from '${name}' folder.`);

      // For every image found in folder, add the item to the queue for uploading
      files.forEach((filename) => {
        if (filename.indexOf('.jpg') > -1){
          qImages.push({
            objectId: name, 
            imageId: filename, 
            imageLocalPath: path.join(trainingDir, filename)
          }, genericCallback);
        }
      });
    });
  });

  // Proceed to Step 2 after all items in queue have been processed
  qImages.drain = () => step2_AddObjectsToGroup(people);
}

function step2_AddObjectsToGroup(objects) {
  console.log('*** STEP 2 - Adding People to Group "family" ***');
  const groupId = 'family';

  // Define options used for the API request
  const requestOptions = {
    body: JSON.stringify({objectIds: objects}),
    url: `${recoConfig.BASE_URL}/group/${groupId}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Token': recoConfig.TOKEN
    },
    method: 'PUT'
  };

  // Perform the API request using requestOptions and an anonymous callback
  request(requestOptions, (error, response, body) => {
    genericCallback(error, response, body);
    step3_TrainGroup(groupId);
  });
}

function step3_TrainGroup(groupId) {
  console.log(`*** Step 3 - Training Group '${groupId}' ***`);

  // Define options used for the API request
  const requestOptions = {
    url: `${recoConfig.BASE_URL}/group/${groupId}/training`,
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Token': recoConfig.TOKEN
    },
    method: 'POST'
  };

  // Perform the API request using requestOptions and an anonymous callback
  request(requestOptions, (error, response, body) => {
    genericCallback(error, response, body);
  });
}

step1_UploadImages();
