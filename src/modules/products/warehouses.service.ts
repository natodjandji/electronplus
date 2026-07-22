import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  private readonly repo: FirestoreRepository<Warehouse>;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<Warehouse>(firestore, Collections.WAREHOUSES);
  }

  findAll(): Promise<Warehouse[]> {
    return this.repo.findAll({ orderBy: { field: 'name' } });
  }

  findById(id: string): Promise<Warehouse> {
    return this.repo.getOrThrow(id, 'Warehouse not found');
  }

  create(code: string, name: string): Promise<Warehouse> {
    return this.repo.create({ code, name });
  }
}
