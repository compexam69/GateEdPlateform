import { Fragment } from "react";
import { useLocation } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface AdminBreadcrumbCrumb {
  label: string;
  href: string;
}

interface AdminBreadcrumbProps {
  /** Current page label shown as the last (non-clickable) crumb */
  pageName: string;
  /**
   * Optional intermediate crumbs rendered between "Admin Dashboard" and the
   * current page — useful for deeper hierarchies (e.g. subject → chapter).
   */
  crumbs?: AdminBreadcrumbCrumb[];
}

/**
 * Admin breadcrumb trail shown on all screen sizes.
 * Renders: Admin Dashboard > [optional crumbs] > Current Page
 *
 * Uses useLocation for SPA navigation (avoids the Radix Slot + wouter Link
 * hook-context issue) while keeping the native href for accessibility/SEO.
 */
export function AdminBreadcrumb({ pageName, crumbs }: AdminBreadcrumbProps) {
  const [, navigate] = useLocation();

  function handleNav(href: string) {
    return (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      navigate(href);
    };
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/admin" onClick={handleNav("/admin")}>
            Admin Dashboard
          </BreadcrumbLink>
        </BreadcrumbItem>

        {crumbs?.map((crumb) => (
          <Fragment key={crumb.label}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={crumb.href} onClick={handleNav(crumb.href)}>
                {crumb.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}

        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{pageName}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
