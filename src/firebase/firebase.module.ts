import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Modular entry points, not the legacy `import * as admin from 'firebase-admin'`
// namespace — firebase-admin v14 dropped `admin.credential`, `admin.apps` and
// the `admin.app.App` type. The rest of the codebase already imported this way
// (firebase-admin/firestore, firebase-admin/auth); this file was the last
// holdout.
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket } from '@google-cloud/storage';
import { EnvConfig } from '../config/env.validation';
import {
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIREBASE_STORAGE_BUCKET,
  FIRESTORE,
} from './firebase.constants';

function buildCredential(config: ConfigService<EnvConfig, true>): Credential {
  const base64Key = config.get('FIREBASE_SERVICE_ACCOUNT_BASE64', { infer: true });
  if (base64Key) {
    const serviceAccount = JSON.parse(Buffer.from(base64Key, 'base64').toString('utf8'));
    return cert(serviceAccount);
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS (a service-account key file path)
  // or the ambient metadata server when running on GCP.
  return applicationDefault();
}

const firebaseAppProvider: Provider = {
  provide: FIREBASE_APP,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>): App => {
    const existing = getApps();
    if (existing.length > 0) return existing[0];
    return initializeApp({
      credential: buildCredential(config),
      projectId: config.get('FIREBASE_PROJECT_ID', { infer: true }),
    });
  },
};

const firestoreProvider: Provider = {
  provide: FIRESTORE,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => {
    const firestore = getFirestore(app);
    firestore.settings({ ignoreUndefinedProperties: true });
    return firestore;
  },
};

const firebaseAuthProvider: Provider = {
  provide: FIREBASE_AUTH,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => getAuth(app),
};

const storageBucketProvider: Provider = {
  provide: FIREBASE_STORAGE_BUCKET,
  inject: [FIREBASE_APP, ConfigService],
  useFactory: (app: App, config: ConfigService<EnvConfig, true>): Bucket => {
    const bucketName =
      config.get('FIREBASE_STORAGE_BUCKET', { infer: true }) ??
      `${config.get('FIREBASE_PROJECT_ID', { infer: true })}.firebasestorage.app`;
    return getStorage(app).bucket(bucketName);
  },
};

@Global()
@Module({
  providers: [firebaseAppProvider, firestoreProvider, firebaseAuthProvider, storageBucketProvider],
  exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE_BUCKET],
})
export class FirebaseModule {}
