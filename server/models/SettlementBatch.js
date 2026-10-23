const mongoose = require("mongoose");
const schema = new mongoose.Schema({requestKey:{type:String,required:true,unique:true},sourceHash:{type:String,required:true},sourceName:String,actor:{type:mongoose.Schema.Types.ObjectId,ref:"User"},rows:Number,matched:Number,exceptions:Number,status:{type:String,enum:["completed"],default:"completed"}},{timestamps:true});

module.exports = mongoose.model("SettlementBatch",schema);
