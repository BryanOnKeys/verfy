import type { Metadata } from "next";
import { AddDevice, RevokeDevice } from "@/components/device-tools";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { can } from "@/core/permissions";
import { publicEnv } from "@/lib/env";
import { listDevices } from "@/server/data";
import { fmtDate, relTime, requirePageOrg } from "@/server/page";

export const metadata: Metadata = { title: "Devices" };

export default async function DevicesPage() {
  const { db, org } = await requirePageOrg("/dashboard/devices");
  const devices = await listDevices(db, org.id);
  const canEnroll = can(org.role, "devices.enroll");
  const canRevoke = can(org.role, "devices.revoke");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Devices</h1>
          <p>Laptops and CI runners that upload receipts. Verfy stores only each device&apos;s public key; private keys never leave the device.</p>
        </div>
      </div>

      {canEnroll && (
        <section className="glass card-lg" style={{ marginBottom: 16 }} aria-label="Add a device" data-light>
          <AddDevice orgId={org.id} appUrl={publicEnv().NEXT_PUBLIC_APP_URL} />
        </section>
      )}

      {devices.length === 0 ? (
        <EmptyState
          icon="device"
          title="No devices yet"
          body={canEnroll ? "Create an enrollment code above and run the command on a developer machine." : "Ask an owner or admin to enroll your machine."}
        />
      ) : (
        <div className="glass" data-light>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Enrolled devices</caption>
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">Status</th>
                  <th scope="col">Key ID</th>
                  <th scope="col" className="num">Receipts</th>
                  <th scope="col">Last upload</th>
                  <th scope="col">Enrolled</th>
                  {canRevoke && <th scope="col"><span className="visually-hidden">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const chain = (Array.isArray(d.chains) ? d.chains[0] : d.chains) as { receipt_count: number } | undefined;
                  return (
                    <tr key={d.id as string}>
                      <td>
                        <strong>{d.name as string}</strong>
                        <div className="tiny muted">{(d.platform as string | null) || "—"}</div>
                      </td>
                      <td><span className={`badge badge-${d.status as string}`}>{d.status as string}</span></td>
                      <td className="mono small">{d.kid as string}</td>
                      <td className="num">{(chain?.receipt_count ?? 0).toLocaleString("en-US")}</td>
                      <td className="small text-2" title={fmtDate(d.last_seen_at as string | null)}>{relTime(d.last_seen_at as string | null)}</td>
                      <td className="small muted">{fmtDate(d.created_at as string)}</td>
                      {canRevoke && (
                        <td>{d.status === "active" ? <RevokeDevice orgId={org.id} deviceId={d.id as string} name={d.name as string} /> : <span className="tiny muted">revoked {fmtDate(d.revoked_at as string)}</span>}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Icon name="info" size={16} />
        <span>If a laptop is lost, revoke it here first. Its token stops working at once; the receipts it already uploaded stay verifiable.</span>
      </div>
    </>
  );
}
