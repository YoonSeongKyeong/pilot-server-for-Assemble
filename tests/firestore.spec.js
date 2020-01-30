const assert = require('assert')
const express = require('express')
const admin = require('firebase-admin')
const serviceAccount = require("../secret/assemble-63b5e-firebase-adminsdk-b0ink-a488c4d3fb.json")

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

let db = admin.firestore()

describe('firestore basic connection test', function () {
    before(function () {
        // excuted before test suite
    })

    after(function () {
        // excuted after test suite
        let docRef = db.collection('testCol').doc('alovelace')

        docRef.delete()
    })

    beforeEach(function () {
        // excuted before every test
    })

    afterEach(function () {
        // excuted after every test
    })

    describe('simple add to and get from firestore', function () {
        it('should add a record', function (done) {
            // write test logic
            let docRef = db.collection('testCol').doc('alovelace')

            docRef.set({
                first: 'Ada',
                last: 'Lovelace',
                born: 1815222
            }).then(res => {
                done()
            })
        })

        it('should get a record', function (done) {
            // write test logic
            let docRef = db.collection('testCol').doc('alovelace')

            docRef.get().then(res => {
                if (res.exists === true) {
                    done()
                }
            })
        })
    })
})