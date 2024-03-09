import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";

// Define the Worker interface
interface Worker {
  id: string;
  name: string;
  // Add other properties as necessary
}

const ManageWorkers: React.FC = () => {
  const { user, detail } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);



  useEffect(() => {
    if (!detail || !detail.agentId) return;

    const fetchWorkers = async () => {
      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'worker'), 
        where('agentId', '==', detail.agentId)
      );
      const querySnapshot = await getDocs(q);
      const fetchedWorkers = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Worker, 'id'>), // Cast the document data to Worker, excluding 'id' which is manually added
      }));
      setWorkers(fetchedWorkers);
    };

    fetchWorkers();
  }, [detail]);

  return (
    <div  style={{ paddingTop: '4rem' }}   >
    <h1  style={{ textAlign: 'right' , paddingRight: '20px' }}  > ניהול עובדים
    </h1>
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '20px' }}>
      <table  style={{ textAlign: 'right' }} >
        <thead>
          <tr>
            <th> שם עובד</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => (
            <tr key={worker.id}> {/* Use worker.id as key for React elements */}
              <td>{worker.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div  style={{ textAlign: 'right' , paddingRight: '20px' }}> {detail?.role === 'agent' ? (
        <Link href={`/auth/sign-up/${user?.uid}`} className="text-custom-green">צור עובד חדש</Link>
      ) : null}</div>
    </div>
  );
};

export default ManageWorkers;
