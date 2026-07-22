"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const admin = __importStar(require("firebase-admin"));
const firebase_constants_1 = require("./firebase.constants");
function buildCredential(config) {
    const base64Key = config.get('FIREBASE_SERVICE_ACCOUNT_BASE64', { infer: true });
    if (base64Key) {
        const serviceAccount = JSON.parse(Buffer.from(base64Key, 'base64').toString('utf8'));
        return admin.credential.cert(serviceAccount);
    }
    return admin.credential.applicationDefault();
}
const firebaseAppProvider = {
    provide: firebase_constants_1.FIREBASE_APP,
    inject: [config_1.ConfigService],
    useFactory: (config) => {
        if (admin.apps.length > 0)
            return admin.apps[0];
        return admin.initializeApp({
            credential: buildCredential(config),
            projectId: config.get('FIREBASE_PROJECT_ID', { infer: true }),
        });
    },
};
const firestoreProvider = {
    provide: firebase_constants_1.FIRESTORE,
    inject: [firebase_constants_1.FIREBASE_APP],
    useFactory: (app) => {
        const firestore = app.firestore();
        firestore.settings({ ignoreUndefinedProperties: true });
        return firestore;
    },
};
const firebaseAuthProvider = {
    provide: firebase_constants_1.FIREBASE_AUTH,
    inject: [firebase_constants_1.FIREBASE_APP],
    useFactory: (app) => app.auth(),
};
let FirebaseModule = class FirebaseModule {
};
exports.FirebaseModule = FirebaseModule;
exports.FirebaseModule = FirebaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [firebaseAppProvider, firestoreProvider, firebaseAuthProvider],
        exports: [firebase_constants_1.FIRESTORE, firebase_constants_1.FIREBASE_AUTH],
    })
], FirebaseModule);
//# sourceMappingURL=firebase.module.js.map