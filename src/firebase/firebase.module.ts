import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import type { Bucket } from '@google-cloud/storage';
import { EnvConfig } from '../config/env.validation';
import {
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIREBASE_STORAGE_BUCKET,
  FIRESTORE,
} from './firebase.constants';

function buildCredential(config: ConfigService<EnvConfig, true>): admin.credential.Credential {
  const base64Key = config.get('FIREBASE_SERVICE_ACCOUNT_BASE64', { infer: true });
  if (base64Key) {
    const serviceAccount = JSON.parse(Buffer.from(base64Key, 'base64').toString('utf8'));
    return admin.credential.cert(serviceAccount);
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS (a service-account key file path)
  // or the ambient metadata server when running on GCP.
  return admin.credential.applicationDefault();
}

const firebaseAppProvider: Provider = {
  provide: FIREBASE_APP,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>): admin.app.App => {
    if (admin.apps.length > 0) return admin.apps[0] as admin.app.App;
    return admin.initializeApp({
      credential: buildCredential(config),
      projectId: config.get('FIREBASE_PROJECT_ID', { infer: true }),
    });
  },
};

const firestoreProvider: Provider = {
  provide: FIRESTORE,
  inject: [FIREBASE_APP],
  useFactory: (app: admin.app.App) => {
    const firestore = app.firestore();
    firestore.settings({ ignoreUndefinedProperties: true });
    return firestore;
  },
};

const firebaseAuthProvider: Provider = {
  provide: FIREBASE_AUTH,
  inject: [FIREBASE_APP],
  useFactory: (app: admin.app.App) => app.auth(),
};

const storageBucketProvider: Provider = {
  provide: FIREBASE_STORAGE_BUCKET,
  inject: [FIREBASE_APP, ConfigService],
  useFactory: (app: admin.app.App, config: ConfigService<EnvConfig, true>): Bucket => {
    const bucketName =
      config.get('FIREBASE_STORAGE_BUCKET', { infer: true }) ??
      `${config.get('FIREBASE_PROJECT_ID', { infer: true })}.firebasestorage.app`;
    return app.storage().bucket(bucketName);
  },
};

@Global()
@Module({
  providers: [firebaseAppProvider, firestoreProvider, firebaseAuthProvider, storageBucketProvider],
  exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE_BUCKET],
})
export class FirebaseModule {}
