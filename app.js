const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser');

const app = express()

const port = 3000

const http = require('http').createServer(app);
const io = require('socket.io')(http);

const rooms = require('./routes/rooms')(io);

app.use(cors({// to use cookie
  origin: true,
  credentials: true,
}))
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());

app.use('/rooms', rooms);

app.get('/', (req, res) => res.send('Hello World!'))

io.on('connection', function (socket) {
  // socket에 연결된 이후, 해당 유저에게 방id와 이름을 저장
  let {roomId, name} = socket.handshake.query
  socket.roomId = roomId
  socket.name = name
  console.log("connected roomID: ", roomId, ", connected name: ", name)
  socket.join(roomId)
  // socket.on('drop', function() {// drop message를 Client에서 보내면 해당 socket을 제거한다. 방 삭제 또는 추방 시에 사용. Client는 drop message를 받았을 때 Room 쿠키를 제거하고, 연결을 끊는 준비를 한다 (더이상 요청을 보내지 않는다.) 그 후 server에 drop message를 보낸다.
  //   socket.disconnect()
  // })
  socket.on('disconnect', function() {
    console.log("disconnected roomID: ", roomId, ", disconnected name: ", name)
  });
});

http.listen(port, function(){
  console.log(`listening on *:${port}`);
});