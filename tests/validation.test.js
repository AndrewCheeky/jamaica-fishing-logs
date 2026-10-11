import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeTrip,canonicalFingerprint} from '../src/validation.js';
const base={fishing_date:'2026-10-01',bank:'Pedro Bank',method:'Trolling',target_species:'Sailfish',hours_fished:4,anglers_count:2,caught_any:true,catches:[{species:'Sailfish',quantity:1},{species:'Tuna',quantity:2}]};
test('multiple species and sailfish supported',()=>assert.equal(normalizeTrip(base).catches.length,2));
test('zero-catch trips supported',()=>assert.deepEqual(normalizeTrip({...base,caught_any:false,catches:[]}).catches,[]));
test('mixed requires at least two methods',()=>{assert.throws(()=>normalizeTrip({...base,method:'Mixed',mixed_methods:['Trolling']}));assert.equal(normalizeTrip({...base,method:'Mixed',mixed_methods:['Trolling','Bottom Fishing']}).mixed_methods.length,2)});
test('fingerprint excludes catch detail',()=>assert.equal(canonicalFingerprint(normalizeTrip(base)),canonicalFingerprint(normalizeTrip({...base,catches:[{species:'Tuna',quantity:3}]}))));
test('invalid quantity rejected',()=>assert.throws(()=>normalizeTrip({...base,catches:[{species:'Tuna',quantity:0}]})));
