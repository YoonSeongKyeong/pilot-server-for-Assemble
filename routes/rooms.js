var express = require('express')
var router = express.Router()
let jwt = require("jsonwebtoken")
let secretObj = require("../secret/jwt.js")

// firestore preparation start
const admin = require('firebase-admin')
const serviceAccount = require("../secret/assemble-63b5e-firebase-adminsdk-b0ink-a488c4d3fb.json")

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

let db = admin.firestore()
// firestore preparation finished
let FieldValue = admin.firestore.FieldValue; 

let returnRouter = function (io) { // returning router which use the socket.io

    router.post('/', async function (req, res) { // create new room
        // 새로운 방을 만든다.
        debugger
        let newId
        let isIdUnique = false
        while (!isIdUnique) {
            newId = (Math.random() * 10000000 + 10000) + ''
            try {
                let getRoomWithNewId = await db.collection('rooms').doc(newId).get() //check duplicate id
                if (!getRoomWithNewId.exists) {
                    isIdUnique = true
                }
            } catch (error) {
                console.error(error.message)
                res.status(500).send()
                return

            }
        }
        let {
            password,
            roomname
        } = req.body
        try {
            let newRoom = { // this is ROOM STRUCTURE
                room_id: newId,
                password: password,
                roomname: roomname,
                payment_list: JSON.stringify([])
            }
            let postNewRoom = await db.collection('rooms').doc(newId).set(newRoom)
            res.status(201).send({
                id: newId
            })
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.post('/:room_id', async function (req, res) { // join room with password
        // 방에 비밀번호를 사용해서 입장한다.
        debugger
        let room_id = req.params.room_id
        let {
            password
        } = req.body
        try {
            let getRoomWithId = await db.collection('rooms').doc(room_id).get() //check duplicate id
            if (getRoomWithId.exists) {
                let data = getRoomWithId.data()
                if (data.password === password) {
                    let token = jwt.sign({
                            room_id: room_id // payload
                        },
                        secretObj.secret, // secret key
                        {
                            expiresIn: '2 days' // expire time
                        })
                    res.cookie("room", token, {
                        maxAge: 900000
                    })
                    res.status(200).json({
                        token: token
                    })
                    return
                }
                res.clearCookie("room")
                res.status(401).send()
                return
            }
            res.status(404).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.delete('/:room_id', async function (req, res) {
        // room_id 해당하는 방을 삭제하고 (database 내에서 정보 제거 후 연결 전부 끊고) 200 응답.
        debugger
        let room_id = req.params.room_id

        try {
            io.to(room_id).emit("drop", "") // 클라이언트에 drop 메시지를 보내서 종료를 알린다.

            // Chats Collection 지우기
            let batch = admin.firestore().batch()

            Promise.all([db.collection('rooms').doc(room_id).collection('chats').listDocuments().then(val => {
                    val.map((val) => {
                        batch.delete(val)
                    })
                }),

                // People Collection 지우기
                db.collection('rooms').doc(room_id).collection('people').listDocuments().then(val => {
                    val.map((val) => {
                        batch.delete(val)
                    })
                })
            ]).then(() => {
                // 작업이 모두 다 끝난 후에 Room 지우기
                let roomRef = db.collection('rooms').doc(room_id)
                batch.delete(roomRef)

                batch.commit()
            })


            res.status(200).send()
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
        }
    })

    router.get('/memory', async function (req, res) { // get information about room_id and name saved in jwt
        // 예전에 기억해둔 인증 정보를 자동으로 재인증한다.
        debugger

        let token = req.cookies.room
        if (token !== undefined) {
            let decoded = jwt.verify(token, secretObj.secret)
            if (decoded) {
                try {

                    let room_id = undefined
                    let name = undefined
                    let getRoomWithId = await db.collection('rooms').doc(decoded.room_id).get() //verify room
                    if (getRoomWithId.exists) {
                        room_id = decoded.room_id
                        if (decoded.name !== undefined) {
                            let getPersonWithName = await db.collection('rooms').doc(decoded.room_id).collection('people').doc(decoded.name).get() //verify name
                            if (getPersonWithName.exists) {
                                name = decoded.name
                            }
                        }
                    }
                    res.status(200).json({
                        room_id: room_id,
                        name: name
                    })
                    return
                } catch (error) {
                    console.error(error.message)
                    res.status(500).send()
                    return
                }
            }
        }
        res.status(404).json({
            room_id: undefined,
            name: undefined
        })
    })

    router.get('/:room_id/model', async function (req, res) { // get whole model information of the room
        // 현재 채팅방의 모델 정보 전체를 반환한다.
        debugger
        try {
            let {room_id} = req.params
            let getRoomWithId = await db.collection('rooms').doc(room_id).get() //check duplicate id
            let getAllPeople = await db.collection('rooms').doc(room_id).collection('people').get()
            let getAllChats = await db.collection('rooms').doc(room_id).collection('chats').get()
            let roomInfo = getRoomWithId.data()
            roomInfo.payment_list = JSON.parse(roomInfo.payment_list)
            roomInfo.people = getAllPeople.docs.map(eachP => {
                debugger
                let eachObj = eachP.data()
                eachObj.avail_schedules_list = JSON.parse(eachObj.avail_schedules_list)
                eachObj.avail_places_list = JSON.parse(eachObj.avail_places_list)
                eachObj.activity_list = JSON.parse(eachObj.activity_list)
                eachObj.menu_list = JSON.parse(eachObj.menu_list)
                return eachObj
            })
            roomInfo.chats = getAllChats.docs.map(eachC => {
                let chat = eachC.data()
                chat.created_at = chat.created_at.toDate()
                return chat
            })
            res.status(200).json(roomInfo)
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.get('/disconnect', async function (req, res) { // remove room information in jwt
        // jwt안의 방 정보가 지워진다.
        debugger
        res.clearCookie("room")
        res.status(200).send()
    })

    router.get('/:room_id/people/disconnect', async function (req, res) { // remove name information in jwt
        // jwt안의 참여자 정보가 지워진다.
        debugger
        let {room_id} = req.params
        let {socket_id} = req.query
        let token = jwt.sign({
                room_id: room_id, // payload
                name: undefined
            },
            secretObj.secret, // secret key
            {
                expiresIn: '2 days' // expire time
            })
        io.to(socket_id).emit("drop", "")
        res.cookie("room", token)
        res.status(200).send()
    })

    router.get('/:room_id/people/:name', async function (req, res) { // check if person exist
        debugger
        let {
            room_id,
            name
        } = req.params
        // 해당 이름을 가진 사람이 존재하는지 확인한다. 
        try {
            let getRoomWithId = await db.collection('rooms').doc(room_id).get() //check duplicate id
            if (getRoomWithId.exists) {
                let getPersonWithName = await db.collection('rooms').doc(room_id).collection('people').doc(name).get() //check duplicate name
                if (getPersonWithName.exists) {
                    let token = jwt.sign({
                            room_id: room_id, // payload
                            name: name
                        },
                        secretObj.secret, // secret key
                        {
                            expiresIn: '2 days' // expire time
                        })
                    res.cookie("room", token, {overwrite: true})
                    res.status(200).json({
                        token: token
                    })
                    return
                }
                res.status(404).send("name not exist")
                return
            }
            res.clearCookie("room")
            res.status(404).send("room no more exist")
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.post('/:room_id/people', async function (req, res) { // create new person with the submitted name
        // 받은 이름이 중복인지 확인 후 새 참여자 정보를 생성한다. (생성시 broadcasting 필요)
        debugger
        let room_id = req.params.room_id
        let {
            name
        } = req.body
        try {
            let getRoomWithId = await db.collection('rooms').doc(room_id).get() //check duplicate id
            if (getRoomWithId.exists) {
                let getPersonWithName = await db.collection('rooms').doc(room_id).collection('people').doc(name).get() //check duplicate name
                if (!getPersonWithName.exists) {
                    let newPerson = { // this is PEOPLE STRUCTURE
                        name: name,
                        avail_schedules_list: JSON.stringify([]),
                        avail_places_list: JSON.stringify([]),
                        activity_list: JSON.stringify([]),
                        menu_list: JSON.stringify([])
                    }
                    let createName = await db.collection('rooms').doc(room_id).collection('people').doc(name).set(newPerson)
                    console.log(`new Person :${newPerson.name} created in roomID: ${room_id}`)
                    io.to(room_id).emit("new person", newPerson)
                    let token = jwt.sign({
                            room_id: room_id, // payload
                            name: name
                        },
                        secretObj.secret, // secret key
                        {
                            expiresIn: '2 days' // expire time
                        })
                    res.cookie("room", token)
                    res.status(200).json({
                        token: token
                    })
                    return
                }
                res.status(409).send("name already exist")
                return
            }
            res.clearCookie("room")
            res.status(404).send("room no more exist")
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.delete('/:room_id/people/:name', async function (req, res) { // remove the person
        // 해당 이름에 해당하는 참여자를 삭제한다. (삭제시 broadcasting 필요)
        debugger
        let {
            room_id,
            name
        } = req.params

        try {
            let getPersonWithName = await db.collection('rooms').doc(room_id).collection('people').doc(name).delete() //check duplicate name
            console.log(`Person :${name} deleted from roomID: ${room_id}`)
            io.to(room_id).emit("delete person", name)
            res.status(200).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.post('/:room_id/chats', async function (req, res) { // save and broadcast the chat
        // 새 채팅을 받아서 저장하고, 방송한다.
        debugger
        let room_id = req.params.room_id
        let content = req.body.content

        try {
            let token = req.cookies.room
            let decoded = jwt.verify(token, secretObj.secret)
            let author_name = decoded.name
            let idDerivedByTime = Date.now() + '' // 완벽히 동시에 전송된 채팅은 같은 id가 될 우려가 있다. 이를 해결하려면 뒤에 MAC ID로부터 추출된 숫자를 붙이는 방법이 있다.

            let newChat = { // this is CHAT STRUCTURE
                id: idDerivedByTime,
                author_name: author_name,
                content: content,
                created_at: FieldValue.serverTimestamp()// 완벽히 동시에 전송된 채팅은 같은 id가 될 우려가 있다. 이를 해결하려면 뒤에 MAC ID로부터 추출된 숫자를 붙이는 방법이 있다.
            }

            let createChat = await db.collection('rooms').doc(room_id).collection('chats').doc(idDerivedByTime).set(newChat)
            console.log(`chat message: ${content} by ${author_name} in roomID: ${room_id}`)
            newChat.created_at=(new Date(Date.now()).toJSON())// for unifying the format of newChat obj. losing precision on socket.
            io.to(room_id).emit("chat message", newChat)
            res.status(200).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.put('/:room_id/people/:name/avail_schedules_list', async function (req, res) { // save and broadcast the list
        //가능한 스케줄 저장 후 방송
        debugger
        let {
            room_id,
            name
        } = req.params
        let {
            avail_schedules_list
        } = req.body
        try {
            let changeAvailableSchedulesList = await db.collection('rooms').doc(room_id).collection('people').doc(name).update({
                avail_schedules_list: JSON.stringify(avail_schedules_list)
            })
            let idDerivedByNameAndTime = '' + name + Date.now() // send id for patch double message problem
            io.to(room_id).emit("new schedule_list", {
                id: idDerivedByNameAndTime,
                name: name,
                avail_schedules_list: avail_schedules_list
            })
            res.status(200).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.put('/:room_id/people/:name/avail_places_list', async function (req, res) { // save and broadcast the list
        //가능한 장소를 받아서 저장 후 방송
        debugger
        let {
            room_id,
            name
        } = req.params
        let {
            avail_places_list
        } = req.body
        try {
            let changeAvailablePlacesList = await db.collection('rooms').doc(room_id).collection('people').doc(name).update({
                avail_places_list: JSON.stringify(avail_places_list)
            })
            let idDerivedByNameAndTime = '' + name + Date.now() // send id for patch double message problem
            io.to(room_id).emit("new place_list", {
                id: idDerivedByNameAndTime,
                name: name,
                avail_places_list: avail_places_list
            })
            res.status(200).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.put('/:room_id/people/:name/activity_list', async function (req, res) { // save and broadcast the list
        // 활동 리스트를 받아서 저장하고, 방송한다.
        debugger
        let {
            room_id,
            name
        } = req.params
        let {
            activity_list
        } = req.body
        try {
            let changeActivityList = await db.collection('rooms').doc(room_id).collection('people').doc(name).update({
                activity_list: JSON.stringify(activity_list)
            })
            let idDerivedByNameAndTime = '' + name + Date.now() // send id for patch double message problem
            io.to(room_id).emit("new activity_list", {
                id: idDerivedByNameAndTime,
                name: name,
                activity_list: activity_list
            })
            res.status(200).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    router.put('/:room_id/people/:name/menu_list', async function (req, res) { // save and broadcast the list
        //메뉴리스트 저장 후 방송
        debugger
        let {
            room_id,
            name
        } = req.params
        let {
            menu_list
        } = req.body
        try {
            let changeMenuList = await db.collection('rooms').doc(room_id).collection('people').doc(name).update({
                menu_list: JSON.stringify(menu_list)
            })
            let idDerivedByNameAndTime = '' + name + Date.now() // send id for patch double message problem
            io.to(room_id).emit("new menu_list", {
                id: idDerivedByNameAndTime,
                name: name,
                menu_list: menu_list
            })
            res.status(200).send()
            return
        } catch (error) {
            console.error(error.message)
            res.status(500).send()
            return
        }
    })

    return router
}





module.exports = returnRouter