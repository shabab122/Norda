const mongoose = require("mongoose");
const schema = new mongoose.Schema({_id:{type:String,default:"store"},enabled:{type:Boolean,default:false},allowSplit:{type:Boolean,default:true},revision:{type:Number,default:0},locations:[new mongoose.Schema({warehouse:{type:String,required:true},priority:{type:Number,default:10}},{_id:false})],updatedBy:mongoose.Schema.Types.ObjectId},{timestamps:true});

module.exports = mongoose.model("FulfillmentPolicy",schema);
