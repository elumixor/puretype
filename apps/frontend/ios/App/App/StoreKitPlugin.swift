import Capacitor
import Foundation
import StoreKit

// StoreKit 2 bridge for PureType Pro. Exposed to JS as the "StoreKit" plugin
// (see src/lib/storekit.ts). Capacitor 8 self-registers plugins that conform
// to CAPBridgedPlugin — no ObjC .m registration file needed.
//
// IMPORTANT (manual Xcode step): add this file to the "App" target and enable
// the In-App Purchase capability. See IAP_SETUP.md.
@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
    ]

    private let productIds = ["app.puretype.pro.monthly", "app.puretype.pro.yearly"]
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Listen for transactions that arrive outside an explicit purchase
        // (e.g. Ask-to-Buy approvals, renewals) and finish them.
        updatesTask = Task.detached { [weak self] in
            guard let self else { return }
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                    await self.emitEntitlement()
                }
            }
        }
    }

    deinit { updatesTask?.cancel() }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: productIds)
                let mapped: [[String: Any]] = products.map { p in
                    let unit = p.subscription?.subscriptionPeriod.unit
                    let period = unit == .year ? "year" : (unit == .month ? "month" : (unit == .week ? "week" : "day"))
                    let hasIntro = p.subscription?.introductoryOffer != nil
                    return [
                        "id": p.id,
                        "displayName": p.displayName,
                        "displayPrice": p.displayPrice,
                        "period": period,
                        "hasIntroOffer": hasIntro,
                    ]
                }
                call.resolve(["products": mapped])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing product id")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [id])
                guard let product = products.first else {
                    call.reject("Product not found")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
                        call.resolve(["entitled": await isEntitled()])
                    } else {
                        call.reject("Purchase could not be verified")
                    }
                case .userCancelled:
                    call.resolve(["entitled": await isEntitled()])
                case .pending:
                    call.resolve(["entitled": false])
                @unknown default:
                    call.resolve(["entitled": await isEntitled()])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                // sync can throw if the user cancels the auth sheet — still
                // report current entitlements.
            }
            call.resolve(["entitled": await isEntitled()])
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task { call.resolve(["entitled": await isEntitled()]) }
    }

    private func isEntitled() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, productIds.contains(transaction.productID),
                transaction.revocationDate == nil
            {
                return true
            }
        }
        return false
    }

    private func emitEntitlement() async {
        notifyListeners("entitlementChanged", data: ["entitled": await isEntitled()])
    }
}
