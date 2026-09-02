import Navbar from '@/components/Navbar';
import SharedListing from './SharedListing';

export const metadata = {
  title: 'Shared listing · OneRail',
  description: 'A secondhand listing shared from OneRail.',
};

export default function SharedListingPage() {
  return (
    <>
      <Navbar />
      <SharedListing />
    </>
  );
}
