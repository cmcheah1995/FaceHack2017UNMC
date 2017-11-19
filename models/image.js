var mongoose = require('mongoose');

var imgSchema = new mongoose.Schema({
    album: String,
    num: Number,
    person: [String],
    img: String,
    ranName: Number
});

module.exports = mongoose.model("image", imgSchema);