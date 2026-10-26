import {
  serviceDetailsLines,
  taskOf,
  type ServiceDetails,
} from "@/lib/service-tasks";
export function ServiceDetailsView({
  details,
  en = false,
}: {
  details: ServiceDetails;
  en?: boolean;
}) {
  const task = taskOf(details.task);
  return (
    <section className="service-order-details">
      <h3>{en ? task?.en : task?.label}</h3>
      <dl className="service-detail-list">
        {serviceDetailsLines(details, en ? "en" : "ko").map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
