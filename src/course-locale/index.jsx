import React from 'react';

import { RowadFooter, RowadHeader } from '@edx/frontend-component-header';

import CourseLocaleProvider, { useCourseLocale } from './CourseLocaleProvider';

export const CourseLocaleHeader = () => {
  const { languageOverride, onLanguageChange } = useCourseLocale();
  return <RowadHeader languageOverride={languageOverride} onLanguageChange={onLanguageChange} />;
};

export const CourseLocaleFooter = () => {
  const { languageOverride } = useCourseLocale();
  return <RowadFooter languageOverride={languageOverride} />;
};

export { CourseLocaleProvider, useCourseLocale };
