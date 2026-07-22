"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncStatus = exports.SyncDirection = void 0;
var SyncDirection;
(function (SyncDirection) {
    SyncDirection["INBOUND"] = "inbound";
    SyncDirection["OUTBOUND"] = "outbound";
})(SyncDirection || (exports.SyncDirection = SyncDirection = {}));
var SyncStatus;
(function (SyncStatus) {
    SyncStatus["RUNNING"] = "running";
    SyncStatus["SUCCESS"] = "success";
    SyncStatus["ERROR"] = "error";
})(SyncStatus || (exports.SyncStatus = SyncStatus = {}));
//# sourceMappingURL=sync-log.entity.js.map