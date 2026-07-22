"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreRepository = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
class FirestoreRepository {
    constructor(firestore, collectionPath) {
        this.firestore = firestore;
        this.collectionPath = collectionPath;
    }
    collection() {
        return this.firestore.collection(this.collectionPath);
    }
    doc(id) {
        return this.collection().doc(id);
    }
    fromSnapshot(snap) {
        const data = snap.data();
        return {
            ...data,
            id: snap.id,
            createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
        };
    }
    async findById(id) {
        const snap = await this.doc(id).get();
        if (!snap.exists)
            return null;
        return this.fromSnapshot(snap);
    }
    async getOrThrow(id, notFoundMessage = 'Resource not found') {
        const found = await this.findById(id);
        if (!found)
            throw new common_1.NotFoundException(notFoundMessage);
        return found;
    }
    async create(data, id) {
        const ref = id ? this.doc(id) : this.collection().doc();
        const now = firestore_1.FieldValue.serverTimestamp();
        await ref.set({ ...data, createdAt: now, updatedAt: now });
        return this.getOrThrow(ref.id);
    }
    async update(id, data) {
        await this.doc(id).set({ ...data, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        return this.getOrThrow(id);
    }
    async delete(id) {
        await this.doc(id).delete();
    }
    async findAll(options = {}) {
        let query = this.collection();
        for (const clause of options.where ?? []) {
            query = query.where(clause.field, clause.op, clause.value);
        }
        if (options.orderBy) {
            query = query.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
        }
        if (options.limit) {
            query = query.limit(options.limit);
        }
        const snap = await query.get();
        return snap.docs.map((d) => this.fromSnapshot(d));
    }
    async findOne(where, orderBy) {
        const results = await this.findAll({ where, orderBy, limit: 1 });
        return results[0] ?? null;
    }
}
exports.FirestoreRepository = FirestoreRepository;
//# sourceMappingURL=firestore.repository.js.map