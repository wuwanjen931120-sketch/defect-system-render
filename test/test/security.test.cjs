"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const s=require("../lib/security.cjs");
test("normalize email",()=>assert.equal(s.normalizeEmail(" Test@Example.COM "),"test@example.com"));
test("password policy",()=>{assert.equal(s.validatePassword("123456").valid,false);assert.equal(s.validatePassword("SafePassword2026").valid,true);});
test("MQTT payload",()=>{assert.equal(s.normalizeDefectPayload({system_id:"S1",id:"A1",status:"ok"}).items[0].status,"OK");assert.throws(()=>s.normalizeDefectPayload({system_id:"S1",id:"A1",status:"BAD"}));});
test("OTP hash",()=>assert.equal(s.hashOtp("A@B.COM","123456","secret"),s.hashOtp("a@b.com","123456","secret")));
test("clamp",()=>assert.equal(s.clampInt("999",20,1,100),100));
