import { supabase } from "../lib/supabaseClient";

export default async function Home() {
  const { data: majors, error } = await supabase
    .from("university_majors")
    .select("name")
    .order("name", { ascending: true });

  return (
    <main className="page">
      <div className="card">
        <h1 className="caption">Majors</h1>

        {error ? (
          <p className="caption">Failed to load majors: {error.message}</p>
        ) : majors && majors.length > 0 ? (
          <div className="table-shell" role="region" aria-label="Majors list">
            <table className="majors-table">
              <thead>
                <tr>
                  <th>Major</th>
                </tr>
              </thead>
              <tbody>
                {majors.map((major, index) => (
                  <tr
                    key={major.name}
                    style={{
                      backgroundColor: index % 2 === 0 ? "#f5f5f5" : "#ffffff",
                    }}
                  >
                    <td>{major.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="caption">No majors found.</p>
        )}
      </div>
    </main>
  );
}
