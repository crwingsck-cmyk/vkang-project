import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { Inventory, InventoryStatus, InventoryMovement, CostingMethod } from '@/types/models';
import { InventoryBatchService } from './inventoryBatches';

const COLLECTION = 'inventory';

export const InventoryService = {
  /**
   * Get inventory by user (stockist)
   */
  async getByUser(userId: string, pageLimit = 100) {
    const constraints = [
      where('userId', '==', userId),
      orderBy('lastMovementDate', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Inventory>(COLLECTION, constraints);
  },

  /**
   * Get all inventory (admin view)
   */
  async getAll(pageLimit = 200) {
    const constraints = [
      orderBy('lastMovementDate', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Inventory>(COLLECTION, constraints);
  },

  /**
   * Get inventory item by ID
   */
  async getById(id: string) {
    return FirestoreService.get<Inventory>(COLLECTION, id);
  },

  /**
   * Get inventory for a specific product across all users
   */
  async getByProduct(productId: string) {
    const constraints = [
      where('productId', '==', productId),
      orderBy('lastMovementDate', 'desc'),
    ];
    return FirestoreService.query<Inventory>(COLLECTION, constraints);
  },

  /**
   * Get inventory for a specific user and product
   */
  async getByUserAndProduct(userId: string, productId: string) {
    const constraints = [
      where('userId', '==', userId),
      where('productId', '==', productId),
    ];
    const results = await FirestoreService.query<Inventory>(COLLECTION, constraints);
    return results[0] || null;
  },

  /**
   * Create a new inventory record
   */
  async create(inventory: Omit<Inventory, 'id' | 'createdAt' | 'updatedAt'>) {
    const timestamp = Date.now();
    const data: Inventory = {
      ...inventory,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return FirestoreService.set(COLLECTION, `${inventory.userId}_${inventory.productId}`, data);
  },

  /**
   * Update inventory record
   */
  async update(id: string, updates: Partial<Inventory>) {
    return FirestoreService.update<Inventory>(COLLECTION, id, updates);
  },

  /**
   * Adjust inventory quantity
   */
  async adjust(
    id: string,
    quantityChange: number,
    reference: string,
    currentInventory: Inventory
  ) {
    if (quantityChange < 0 && currentInventory.costingMethod === CostingMethod.FIFO) {
      await this.deduct(
        currentInventory.userId,
        currentInventory.productId,
        -quantityChange,
        reference
      );
      return;
    }
    const newQuantityOnHand = currentInventory.quantityOnHand + quantityChange;
    const newQuantityAvailable = currentInventory.quantityAvailable + quantityChange;

    const movement: InventoryMovement = {
      date: Date.now(),
      type: 'adjustment',
      quantity: quantityChange,
      reference,
    };

    let status: InventoryStatus = InventoryStatus.IN_STOCK;
    if (newQuantityAvailable <= 0) {
      status = InventoryStatus.OUT_OF_STOCK;
    } else if (newQuantityAvailable <= currentInventory.reorderLevel) {
      status = InventoryStatus.LOW_STOCK;
    }

    const newMarketValue = newQuantityOnHand * currentInventory.cost;
    return FirestoreService.update<Inventory>(COLLECTION, id, {
      quantityOnHand: newQuantityOnHand,
      quantityAvailable: newQuantityAvailable,
      marketValue: newMarketValue,
      status,
      lastMovementDate: Date.now(),
      movements: [...(currentInventory.movements || []), movement],
    });
  },

  /**
   * Allocate inventory (reserve for an order)
   */
  async allocate(id: string, quantity: number, reference: string, currentInventory: Inventory) {
    const movement: InventoryMovement = {
      date: Date.now(),
      type: 'out',
      quantity,
      reference,
    };

    const newAllocated = currentInventory.quantityAllocated + quantity;
    const newAvailable = currentInventory.quantityAvailable - quantity;

    let status: InventoryStatus = InventoryStatus.IN_STOCK;
    if (newAvailable <= 0) {
      status = InventoryStatus.OUT_OF_STOCK;
    } else if (newAvailable <= currentInventory.reorderLevel) {
      status = InventoryStatus.LOW_STOCK;
    }

    return FirestoreService.update<Inventory>(COLLECTION, id, {
      quantityAllocated: newAllocated,
      quantityAvailable: newAvailable,
      status,
      lastMovementDate: Date.now(),
      movements: [...(currentInventory.movements || []), movement],
    });
  },

  /**
   * 扣減庫存（依 costingMethod 自動選擇 FIFO 或加權平均）
   */
  async deduct(
    userId: string,
    productId: string,
    quantity: number,
    reference: string
  ): Promise<void> {
    const inv = await this.getByUserAndProduct(userId, productId);
    if (!inv?.id) return;

    if (inv.costingMethod === CostingMethod.FIFO) {
      const { deducted } = await InventoryBatchService.deductFifo(
        userId,
        productId,
        quantity
      );
      const movement: InventoryMovement = {
        date: Date.now(),
        type: 'out',
        quantity: deducted,
        reference,
      };
      const newOnHand = inv.quantityOnHand - deducted;
      const newAvailable = inv.quantityAvailable - deducted;
      let status = InventoryStatus.IN_STOCK;
      if (newAvailable <= 0) status = InventoryStatus.OUT_OF_STOCK;
      else if (inv.reorderLevel > 0 && newAvailable <= inv.reorderLevel)
        status = InventoryStatus.LOW_STOCK;
      const newMarketValue = newOnHand * inv.cost;
      await this.update(inv.id, {
        quantityOnHand: newOnHand,
        quantityAvailable: newAvailable,
        marketValue: newMarketValue,
        status,
        lastMovementDate: Date.now(),
        movements: [...(inv.movements || []), movement],
      });
    } else {
      await this.adjust(inv.id, -quantity, reference, inv);
    }
  },

  /**
   * Get low stock items for a user
   */
  async getLowStock(userId: string) {
    const constraints = [
      where('userId', '==', userId),
      where('status', 'in', [InventoryStatus.LOW_STOCK, InventoryStatus.OUT_OF_STOCK]),
    ];
    return FirestoreService.query<Inventory>(COLLECTION, constraints);
  },
};
