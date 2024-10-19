const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')
const cors = require('cors');
const express = require('express')
const socketio = require('socket.io')
const crypto = require('crypto')
const session = require('express-session')
const fs = require('fs')
const hostname = "127.0.0.1";

const app = express();
const server = require('http').createServer(app)
const port = 8008;

app.use(cors());

// Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser())
app.use(session({saveUninitialized: true, resave: true, secret:"ogbdfoodbkfpobfskpod32332323|_+sevsdvv//?~ZZ"}))

var Users = [{
  id: 'jack',
  name: "jackk",
  password: 'd74ff0ee8da3b9806b18c877dbf29bbde50b5bd8e4dad7a3a725000feb82e8f1'
},
{
  id: 'jack2',
  name: "jackk2",
  password: 'd74ff0ee8da3b9806b18c877dbf29bbde50b5bd8e4dad7a3a725000feb82e8f1'
}]
type User = {
  name: string,
  id: string,
  password: string,
  viewers: Array<{email:string,threshold:number}>,
  patients: Array<{email:string}>,
  threshold: number,
  readings: Array<GlucoReading>
}
type GlucoReading = {
  timestamp: Date,
  value: number,
  meal: 'After Meal'|'Before Meal',
  comment: string,
  measure_method: 'blood sample',
  extra_data: Map<string, any>
}
function toReading(x):GlucoReading{
  let glooc:GlucoReading = {
    timestamp: new Date(),
    value: x.value,
    meal: x.meal,
    comment: x.comment,
    measure_method: x.measure_method,
    extra_data: new Map
  }
  //decode timestamp
  const [datePart, timePart] = x.timestamp.split(' ');
  const [year, month, day] = datePart.split('-');
  const [hours, minutes, seconds] = timePart.split(':');
  glooc.timestamp = new Date(year, month - 1, day, hours, minutes, seconds);

  //
  return glooc;
}
function serializeReading(x:GlucoReading){
  let glooc = {
    timestamp: "",
    value: x.value,
    meal: x.meal,
    comment: x.comment,
    measure_method: x.measure_method,
    extra_data: ""
  }
  const date = x.timestamp;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');  // Months are zero-indexed
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  glooc.timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
//NumerIt code
function hash(value){
  const hash = crypto.createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
}
app.post('/register', (req, res)=>{
  if(!req.body.email || !req.body.password){
    res.sendStatus(401);
  }else{
    if(Users.some((user)=>user.id===req.body.email)){
      res.sendStatus(401);
    }else{
      Users.push({id:req.body.email, password:hash(req.body.password), name:req.body.email/*TODO*/})
      console.log(Users)
      res.sendStatus(200);
    }
  }
});
function verify(email, password){
    if(!email || !password){
        return null;
      }else{
        console.log("BENCH");
        let res = null;
        Users.filter(function(user){
          if(user.id===email && user.password===hash(password)){
            console.log("crit");
            res = user;
          }
        });
        return res;
      }
}
function getUser(req){
    return Users.find(val=>(req.session&&req.session.user&&val.id===req.session.user.email)||val.id===req.body.email)
}
app.post('/verify', (req, res)=>{
    let ree = verify(req.body.email, req.body.password);
  if(ree){
    req.session.user = ree;
    console.log("HEY LOGIN WORKED");
    res.status(200).send(ree.name);
  }else{
    console.log("HEY LOGIN FALI");
    res.sendStatus(401);
  }
})
app.get('/logout', function(req, res){
  req.session.destroy(function(){
    console.log("User logged out")
  })
  res.response(200);
})
//check if the provided creds are correct, if not, throw error and fail next step *use as middeware in all user account functions
function checkLogin(req, res, next){
  if(req.session.user){
    next();
  }else if(verify(req.body.email, req.body.password)){
    next();
  }else{
    var err = new Error("Not logged in")
    next(err);
  }
}
app.post('/add_reading', checkLogin, (req, res)=>{
  if(!req.body){//TODO: VALIDATE BODY
    res.sendStatus(401);
  }else{
    let user = getUser(req);
    if(!user.readings)user.readings = [];
    user.readings.push(toReading(req.body));
    res.sendStatus(200);
  }
})
app.post('/get_readings', checkLogin, (req, res)=>{
  let user = getUser(req);
  console.log(user.readings);
  if(!user.readings)user.readings = [];
  res.status(200).json(user.readings.map((i)=>serializeReading(i)));
})
app.post('/spectate_readings', checkLogin, (req, res)=>{
  let user = getUser(req);
  if(!user.patients.some((v)=>v.email==req.uemail)){//make sure user authorizes patient.
    res.status(401);
    return;
  }
  let u = getUser({body:{email:req.uemail}});
  res.status(200).json(u.readings.map((i)=>serializeReading(i)));
})
app.post('/get_viewers', checkLogin, (req, res)=>{
  let user = getUser(req);
  if(!user.viewers)user.viewers = [];
  let rs = user.viewers.map(function(i){
    let u = getUser({body:{email:i.email}});
    i.name = u.name;
    return i;
  });
  res.status(200).json(rs);
})
app.post('/get_patients', checkLogin, (req, res)=>{
  let user = getUser(req);
  if(!user.patients)user.patients = [];
  let rs = user.patients.map(function(i){
    let u = getUser({body:{email:i.email}});
    i.name = u.name;
    return i;
  });
  res.status(200).json(rs);
})
app.post('/change_threshold', checkLogin, (req, res)=>{
  let user = getUser(req);
  user.threshold = req.body.threshold;
  console.log(Users);
  res.status(200).send(req.body.threshold);
})
app.post('/get_threshold', checkLogin, (req, res)=>{
  let user = getUser(req);
  console.log(Users);
  res.status(200).send(user.threshold);
})
app.post('/change_name', checkLogin, (req, res)=>{
  let user = getUser(req);
  user.name = req.body.newname;
  console.log(Users);
  res.status(200).send(req.body.newname);
})
app.post('/change_password', checkLogin, (req, res)=>{
  let user = getUser(req);
  user.password = hash(req.body.newpassword);
  console.log(Users);
  res.sendStatus(200);
})
app.post('/delete', (req, res)=>{
  let user = getUser(req);
  if(user.viewers)for(var v of user.viewers){//remove connected users
    let prey = getUser({body:{email:v.email}});
    prey.patients = prey.patients.filter((val)=>val.email!==req.body.email);
  }
  if(user.patients)for(var v of user.patients){//remove connected patients
    let prey = getUser({body:{email:v.email}});
    prey.viewers = prey.viewers.filter((val)=>val.email!==req.body.email);
  }
  Users = Users.filter((val)=>!(val.id===req.body.email||(req.session&&req.session.user&&val.id===req.session.user.id)));
  req.session.destroy(function(){
    console.log("User deleted")
  })
  console.log(Users);
  res.sendStatus(200);
})
app.post('/connect_user', checkLogin, (req, res)=>{
  if(!req.body.uemail){
    res.sendStatus(401);
  }else{
    let user = getUser(req);
    if(!user.viewers)user.viewers = [];
    else if(user.viewers.some((v)=>v.email===req.body.uemail)){//user already exists
      res.sendStatus(401);
      return;
    }
    user.viewers.push({email:req.body.uemail,threshold:user.threshold});
    let prey = getUser({body:{email:req.body.uemail}});
    if(!prey.patients)prey.patients = [];
    prey.patients.push({email:req.body.email,threshold:user.threshold});
    res.sendStatus(200);
  }
})
app.post('/disconnect_user', checkLogin, (req, res)=>{
  if(!req.body.uemail){
    res.sendStatus(401);
  }else{
    console.log("disconnect user called");
    let user = getUser(req);
    console.log(user);
    if(!user.viewers)user.viewers = [];
    /*if(user.viewers){
      res.sendStatus(401);
      return;
    }*/
    user.viewers = user.viewers.filter((val)=>val.email!==req.body.uemail);
    let prey = getUser({body:{email:req.body.uemail}});
    console.log(prey);
    if(!prey.patients)prey.patients = [];
    prey.patients = prey.patients.filter((val)=>val.email!==req.body.email);
    res.sendStatus(200);
  }
})
app.post('/disconnect_patient', checkLogin, (req, res)=>{
  if(!req.body.uemail){
    res.sendStatus(401);
  }else{
    console.log("disconnect patient called");
    let user = getUser(req);
    console.log(user);
    console.log(req.body.uemail==='jack');
    if(!user.patients)user.patients = [];
    /*if(user.viewers){
      res.sendStatus(401);
      return;
    }*/
    user.patients = user.patients.filter((val)=>val.email!==req.body.uemail);
    let prey = getUser({body:{email:req.body.uemail}});
    console.log(prey);
    if(!prey.viewers)prey.viewers = [];
    prey.viewers = prey.viewers.filter((val)=>val.email!==req.body.email);
    res.sendStatus(200);
  }
})
/*app.use('/welcome', (err, req, res, next)=>{
  console.log(err)
  res.redirect('/login')
})
app.use('/delete', (err, req, res, next)=>{
  console.log(err)
  res.redirect('/login')
})
app.use('/setnum', (err, req, res, next)=>{
  console.log(err)
  res.redirect('/login')
})*/
server.listen(port, () => console.log(`Le serveur est listener sur porte ${port}!`));