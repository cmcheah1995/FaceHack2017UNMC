'use strict'
const fs = require('fs');
const path = require('path');
const async = require('async');
const request = require('request');
const gm = require('gm');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const multer = require('multer');

var app = express();

app.set('view engine','ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + "/public"));
app.use(methodOverride('_method'));
app.locals.moment = require('moment');
mongoose.connect("mongodb://localhost/facehack2017", {useMongoClient: true});
var sampleName = "";
var upload = multer({dest:__dirname +'/uploads/'+ sampleName});
var Image = require('./models/image');
var returnJson;

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

app.get('/', function(req, res){
    res.render('landing');
});

app.get('/album', function (req, res) {
    var album = [{
                name: "Individual",
                image: "https://images.pexels.com/photos/248550/pexels-photo-248550.jpeg?w=1260&h=750&auto=compress&cs=tinysrgb"
            },{
                name: "Friends and Family",
                image: "https://images.pexels.com/photos/9746/people-mother-family-father.jpg?w=1260&h=750&auto=compress&cs=tinysrgb"
            },{
                name: "Acquaintance",
                image: "https://images.pexels.com/photos/551657/pexels-photo-551657.jpeg?w=1260&h=750&auto=compress&cs=tinysrgb"
            }];
    res.render('index', {album:album});
});

app.get('/album/Individual', function(req, res){
    Image.find({'album': 'individual' }, function (err, foundImage) {
        if(err){
            throw err;
        } else {
            res.render('list', {image:foundImage}) ;
        }
    });
});

app.get('/album/Friends%20and%20Family', function(req, res){
    Image.find({'album': 'friends' }, function (err, foundImage) {
        if(err){
            throw err;
        } else {
            res.render('list', {image:foundImage}) ;
        }
    });
});

app.get('/album/Acquaintance', function(req, res){
    Image.find({'album': 'acquaintance' }, function (err, foundImage) {
        if(err){
            throw err;
        } else {
            res.render('list', {image:foundImage}) ;
        }
    });
});


app.get('/image', function (req, res) {
    res.render('image');
});

app.get('/train', function (req, res) {
    res.render('training');
});

app.post('/image/upload', upload.single('photo'), function(req, res) {
    
    var file = __dirname + "/uploads/reco-test/test.jpg";
    fs.readFile( req.file.path, function (err, data) {
        fs.writeFile(file, data, function (err) {
            if( err ){
                console.error( err );
                // res.json({
                //     message: 'Sorry, file couldn\'t be uploaded.',
                //     filename: req.file.originalname
                // });
                // res.redirect('/show');
                console.log(err);
            }else{
                // res.json({
                //     message: 'File uploaded successfully',
                //     filename: req.file.originalname
                // });
                
                function step4_TestReco(groupId) {
                  console.log('*** Step 4 - Test the Face Recognition ***');
                
                  // Define the recognition callback
                  function recoCallback(error, response, body) {
                    if (!error && (response.statusCode == 200)) {
                      returnJson = JSON.parse(body);
                      //eval(require("locus"))
                      returnJson.img = file;
                      console.log('Recognition success:', body);
                      if (gm) {
                        const objects = JSON.parse(body).objects;
                        annotateImage(this.data.imageLocalPath, objects);
                      } else {
                        console.warn('\n*** Install GraphicsMagick to draw face recognition ' + 
                          'results on images.')
                      }
                    } else if (error) {
                      console.error(error);
                    } else {
                      console.error('error: ', response.statusCode, response.statusMessage);
                    }
                  }
                
                  // Create a queue to manage calls made to the /recognition endpoint. This 
                  // queue sets a limit of 1 concurrent upload.
                  const qReco = async.queue((item, callback) => {
                    console.log('\nUsing "' + item.groupId + '" group to recognize faces in ' +
                      item.imageLocalPath + '\n');
                    //eval(require("locus"));
                    //var returnJson.img = item.imageLocalPath;
                    // Create a read stream for the image to be uploaded
                    const imageFileStream = fs.createReadStream(item.imageLocalPath);
                
                    // Define options used for the API request
                    const requestOptions = {
                      url: `${recoConfig.BASE_URL}/recognition`,
                      headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Access-Token': recoConfig.TOKEN
                      },
                      method: 'POST',
                      qs: {
                        groupId: item.groupId
                      }
                    };
                
                    // Pipe the image stream into the request with requestOptions and callback
                    imageFileStream.pipe(request(requestOptions, callback));
                  }, 1);
                
                  
                  // Get paths to the images to test recognition against
                  const recoDir = path.join(__dirname, 'uploads', 'reco-test');
                
                  fs.readdir(recoDir, (err, files) => {
                    console.log(`Recognizing faces in ${files.length} images`);
                
                    // Add each image to the queue to be sent for face recognition
                    files.forEach((filename) => {
                      if (filename.indexOf('.jpg') > -1){
                        qReco.push({
                          groupId: groupId, 
                          imageLocalPath: path.join(recoDir,filename)
                        }, recoCallback);
                      }
                    });
                  });
                
                  // OPTIONAL - Using GraphicsMagick, markup the image with bounding boxes, 
                  // names, and confidence scores.
                  function annotateImage(imageFilePath, objects) {
                    const inPath = path.parse(imageFilePath);
                    const outPath = path.join(__dirname, 'out', inPath.name + '.png');
                
                    // Set minimum confidence threshold needed to have a positive recognition.
                    // Any values below this number will be marked as 'Unknown' in the tutorial.
                    const recognitionConfidenceThreshold = 0.5
                
                    // Load the source image and prepare to draw annotations on it.
                    const outputImage = gm(imageFilePath)
                      .autoOrient()
                      .strokeWidth('2px')
                      .fill('transparent')
                      .font('Courier', 20);
                
                    // Loop over each detected person and draw annotations
                    objects.forEach((face) => {
                      const confidence = face.faceAnnotation.recognitionConfidence;
                      let name = face.objectId;
                
                      // Set the bounding box color for positive recognitions
                      outputImage.stroke('#73c7f1');
                
                      // For low confidence scores, name the face 'Unknown' and use the color 
                      // yellow for the bounding box
                      if (confidence < recognitionConfidenceThreshold) {
                        name = 'Unknown';
                        outputImage.stroke('yellow');
                        console.log('\nAn "Unknown" person was found since recognition ' +
                          'confidence ' + confidence + ' is below the minimum threshold of ' +
                          recognitionConfidenceThreshold);
                      } else {
                        console.log(`\nRecognized '${name}' with confidence ${confidence}`);
                      }
                      
                      
                      const verticesXY = face.faceAnnotation.bounding.vertices.map(
                        vertice => [vertice.x, vertice.y]
                      );
                      console.log('Bounding vertices:', verticesXY);
                
                      // Draw bounding box onto face
                      outputImage.drawPolygon(verticesXY);
                
                      // Get the x,y coordinate of the bottom left vertex
                      const bottomLeft = verticesXY[3];
                      const x = bottomLeft[0];
                      const y = bottomLeft[1];
                
                      // Draw objectId (name) and confidence score onto image
                      outputImage.drawText(x, y + 16, name + '\n' + confidence);
                    });
                
                    // Save annotated image to local filesystem
                    outputImage.write(outPath, (err) => {
                      if (err){
                        console.log('*** Face Recognition results not drawn on image. ' +
                          'Install GraphicsMagick to do so.\n');
                        res.redirect('/show');
                      }
                    });
                  }
                }
                step4_TestReco("family");
                //res.redirect('/show');
            }
            
        });
    });
    
    
});

app.post('/train/upload', upload.array('photos'), function(req, res) {
    var fileArray = req.files;
    var name = req.body.name;
    var dir = __dirname + "/uploads/training/" + name + "/";
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    };
    fileArray.forEach(function(array){
        //eval(require("locus"));
        var file = __dirname + "/uploads/training/" + name + "/" + array.originalname;
        fs.readFile( array.path, function (err, data) {
            fs.writeFile(file, data, function (err) {
                if( err ){
                    console.error( err );
                    res.json({
                        message: 'Sorry, file couldn\'t be uploaded.',
                        filename: array.originalname
                    });
                }else{
                    res.json({
                        message: 'File uploaded successfully',
                        filename: array.originalname
                    });
                }
            });
        });
    })
});


app.get('/show',function(req, res){
    
    //eval(require("locus"));
    var obj = returnJson.objects;
    var people = [];
    var num = 0;
    var album = "";
    var newDir = "";
    var ranName = parseInt(Math.random()*100000000+Date.now());
    
    obj.forEach(function(person){
        if(person.faceAnnotation.recognitionConfidence > 0.7){
            people.push(person.objectId);
        }
    });
    var numOfPeople = obj.length;
    if(numOfPeople === 1){
        newDir = './public/album/individual/IMG' + ranName + '.jpg';
        fs.rename('./uploads/reco-test/test.jpg', newDir, function (err) {
          if (err) throw err;
          console.log('Move complete.');
        });
        album = "individual";
    } else if(people.length > 1){
        newDir = './public/album/friends/IMG' + ranName + '.jpg';
        fs.rename('./uploads/reco-test/test.jpg', newDir, function (err) {
          if (err) throw err;
          console.log('Move complete.');
        });
        album = "friends";
    } else {
        newDir = './public/album/acquaintance/IMG' + ranName + '.jpg'
        fs.rename('./uploads/reco-test/test.jpg', newDir, function (err) {
          if (err) throw err;
          console.log('Move complete.');
        });
        album = "acquaintance";
    }
    returnJson.dir = newDir;

     var newImage = {
        album: album,
        num: numOfPeople,
        person: people,
        img: newDir,
        ranName: ranName
    };
    Image.create(newImage,function(err, addedImage){
        if(err){
            throw err;
        } else {
            console.log("created a new image");
            console.log(addedImage);
            //res.redirect('/list');
        }
    });
    if(newImage.album == "individual"){
        res.redirect('/album/Individual');
    } else if(newImage.album == "friends"){
        Image.find({'album': 'friends' }, function (err, foundImage) {
            if(err){
                throw err;
            } else {
                res.render('list', {image:foundImage}) ;
            }
        });
    } else {
        Image.find({'album': 'acquaintance' }, function (err, foundImage) {
            if(err){
                throw err;
            } else {
                res.render('list', {image:foundImage}) ;
            }
        });
    }
});

// app.get('/list', function(req, res){
//     Image.find({'album': 'individual' }, function (err, foundImage) {
//         if(err){
//             throw err;
//         } else {
//             res.render('list', {image:foundImage}) ;
//         }
//     });
// });

app.get('/*', function(req, res){
   res.redirect('/album'); 
});

app.listen(process.env.PORT, process.env.IP, function(){
   console.log("The Server Has Started!");
});